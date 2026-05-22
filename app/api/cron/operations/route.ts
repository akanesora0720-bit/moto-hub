import { NextRequest, NextResponse } from "next/server";
import { processNotificationQueue } from "@/lib/notifications/process-queue";
import { createServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return req.headers.get("x-cron-secret") === secret;
}

/** Vercel Cron: 名変コンプライアンス・リスク検知・通知キュー送信 */
export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const results: Record<string, unknown> = {};

  const { data: transfer, error: tErr } = await supabase.rpc(
    "run_transfer_compliance_job",
  );
  if (tErr) results.transferError = tErr.message;
  else results.transfer = transfer;

  const { data: risk, error: rErr } = await supabase.rpc(
    "run_risk_detection_job",
  );
  if (rErr) results.riskError = rErr.message;
  else results.risk = risk;

  try {
    results.notifications = await processNotificationQueue(40);
  } catch (e) {
    results.notificationError =
      e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({ ok: true, ...results });
}
