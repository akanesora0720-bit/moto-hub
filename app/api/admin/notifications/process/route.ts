import { NextResponse } from "next/server";
import { canAccessAdmin } from "@/lib/auth";
import { processNotificationQueue } from "@/lib/notifications/process-queue";
import { getViewer } from "@/lib/viewer";
import type { Profile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROUNDS = 20;
const BATCH_SIZE = 50;

/** 管理者操作直後に通知キュー（メール）を即時送信 */
export async function POST() {
  const viewer = await getViewer();
  if (!viewer || !canAccessAdmin(viewer.profile as Profile)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let sent = 0;
  let failed = 0;
  let processed = 0;
  let lastError: string | null = null;

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const result = await processNotificationQueue(BATCH_SIZE);
      sent += result.sent;
      failed += result.failed;
      processed += result.processed;
      if (result.processed === 0) break;
    }
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
  }

  if (lastError) {
    return NextResponse.json(
      { error: lastError, sent, failed, processed },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, sent, failed, processed });
}
