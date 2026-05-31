import { absoluteAppUrl, toBrandDisplay } from "@/lib/brand";
import { renderTemplate } from "@/lib/notifications/render";
import { formatMailTransportError, sendMailMessage } from "@/lib/smtp";
import { createServiceClient } from "@/lib/server-supabase";

function adminRecipients(): string[] {
  const raw =
    process.env.NOTIFICATION_ADMIN_EMAILS?.trim() ||
    process.env.ADMIN_NOTIFICATION_EMAIL?.trim() ||
    "info@moto-hub.jp";
  return raw
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter(Boolean);
}

type QueueRow = {
  id: string;
  event_type: string;
  channel: string;
  payload: Record<string, unknown>;
  retry_count: number;
  max_retries: number;
};

function resolveRecipients(item: QueueRow): string[] {
  const direct = item.payload?.recipient_email;
  if (typeof direct === "string" && direct.trim()) {
    return [direct.trim()];
  }
  return adminRecipients();
}

export async function processNotificationQueue(limit = 30) {
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from("notification_queue")
    .select("id, event_type, channel, payload, retry_count, max_retries")
    .in("status", ["pending"])
    .lte("next_retry_at", now)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;

  const items = (rows ?? []) as QueueRow[];
  let sent = 0;
  let failed = 0;

  for (const item of items) {
    await supabase
      .from("notification_queue")
      .update({ status: "processing" })
      .eq("id", item.id);

    if (item.channel === "in_app") {
      const userId = item.payload?.user_id;
      if (typeof userId === "string") {
        await supabase.from("user_notifications").insert({
          user_id: userId,
          title: toBrandDisplay(String(item.payload?.title ?? item.event_type)),
          body: toBrandDisplay(String(item.payload?.body ?? "")),
          importance: "normal",
          link_url:
            typeof item.payload?.link_url === "string"
              ? item.payload.link_url
              : null,
        });
      }
      await supabase
        .from("notification_queue")
        .update({ status: "sent", processed_at: now, last_error: null })
        .eq("id", item.id);
      sent++;
      continue;
    }

    const { data: tpl } = await supabase
      .from("notification_templates")
      .select("subject_template, body_template, enabled")
      .eq("event_type", item.event_type)
      .maybeSingle();

    if (!tpl?.enabled) {
      await supabase
        .from("notification_queue")
        .update({ status: "cancelled", processed_at: now })
        .eq("id", item.id);
      continue;
    }

    const adminLinkPath =
      typeof item.payload?.admin_link === "string" ? item.payload.admin_link.trim() : "";
    const downloadPath =
      typeof item.payload?.download_url === "string"
        ? item.payload.download_url.trim()
        : "";
    const bodyVars: Record<string, string> = {
      body: String(item.payload?.body ?? ""),
      subject: String(item.payload?.subject ?? ""),
      admin_link: absoluteAppUrl(adminLinkPath),
      download_url: absoluteAppUrl(downloadPath),
    };
    const subject = toBrandDisplay(
      bodyVars.subject || renderTemplate(tpl.subject_template, bodyVars),
    );
    const body = toBrandDisplay(renderTemplate(tpl.body_template, bodyVars));
    const recipients = resolveRecipients(item);

    try {
      if (item.channel === "email") {
        await sendMailMessage({
          to: recipients,
          subject,
          text: body,
        });
      } else {
        throw new Error(`未対応チャネル: ${item.channel}`);
      }

      await supabase.from("notification_logs").insert({
        queue_id: item.id,
        event_type: item.event_type,
        channel: item.channel,
        recipient: recipients.join(", "),
        subject,
        body,
        status: "sent",
        payload: item.payload,
      });

      await supabase
        .from("notification_queue")
        .update({ status: "sent", processed_at: now, last_error: null })
        .eq("id", item.id);
      sent++;
    } catch (e) {
      const msg = formatMailTransportError(e);
      const nextRetry = item.retry_count + 1;
      const giveUp = nextRetry >= item.max_retries;

      await supabase.from("notification_logs").insert({
        queue_id: item.id,
        event_type: item.event_type,
        channel: item.channel,
        recipient: recipients.join(", "),
        subject,
        body,
        status: "failed",
        error_message: msg,
        payload: item.payload,
      });

      await supabase
        .from("notification_queue")
        .update({
          status: giveUp ? "failed" : "pending",
          retry_count: nextRetry,
          next_retry_at: new Date(
            Date.now() + Math.min(3600, 60 * 2 ** nextRetry) * 1000,
          ).toISOString(),
          last_error: msg,
          processed_at: giveUp ? now : null,
        })
        .eq("id", item.id);
      failed++;
    }
  }

  return { processed: items.length, sent, failed };
}
