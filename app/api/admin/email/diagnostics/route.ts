import { NextResponse } from "next/server";
import { buildEmailConfigDiagnostics } from "@/lib/email-config";
import { canAccessAdmin } from "@/lib/auth";
import { getSmtpConfig, sendMailMessage } from "@/lib/smtp";
import { getViewer } from "@/lib/viewer";
import type { Profile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 運営のみ: Resend/SMTP 設定の診断（APIキーはマスク） */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer || !canAccessAdmin(viewer.profile as Profile)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const diagnostics = await buildEmailConfigDiagnostics();
  const smtpReady = !!getSmtpConfig();

  return NextResponse.json({
    ok: smtpReady && diagnostics.likelyCauses.length === 0,
    smtpReady,
    diagnostics,
    checklist: {
      "1_from": diagnostics.fromAddress,
      "2_apiKeySource": diagnostics.apiKeySource,
      "3_apiKeyMasked": diagnostics.apiKeyMasked,
      "4_resendDomainsOnThisKey": diagnostics.resendApiDomains,
      "5_resendApiError": diagnostics.resendApiError,
      "6_sandboxFrom": diagnostics.fromLooksLikeResendSandbox,
    },
  });
}

/**
 * POST body: { "testTo": "you@example.com" } — 1通テスト（任意）
 * 未認証ドメイン時は Resend 550 をそのまま返す
 */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer || !canAccessAdmin(viewer.profile as Profile)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const diagnostics = await buildEmailConfigDiagnostics();
  let testTo: string | undefined;
  try {
    const body = (await req.json()) as { testTo?: string };
    testTo = body.testTo?.trim();
  } catch {
    testTo = undefined;
  }

  if (!testTo) {
    return NextResponse.json({
      diagnostics,
      hint: "テスト送信する場合は POST { \"testTo\": \"宛先@example.com\" }",
    });
  }

  try {
    const info = await sendMailMessage({
      to: testTo,
      subject: "[Moto-Hub] SMTP診断テスト",
      text: `診断テスト送信です。\nFrom: ${diagnostics.fromAddress}\n時刻: ${new Date().toISOString()}`,
    });
    return NextResponse.json({
      ok: true,
      diagnostics,
      testTo,
      smtpResponse: {
        messageId: info.messageId,
        response: info.response,
        accepted: info.accepted,
        rejected: info.rejected,
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        diagnostics,
        testTo,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }
}
