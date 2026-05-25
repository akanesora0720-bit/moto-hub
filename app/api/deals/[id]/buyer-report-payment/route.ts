import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseDealRpcRow } from "@/lib/parse-deal-rpc";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: dealId } = await context.params;
  const supabase = await createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (authError || !userData.user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("buyer_report_payment_sent", {
    p_deal_id: dealId,
  });

  if (error) {
    const msg = error.message ?? "振込報告に失敗しました。";
    const status =
      msg.includes("buyer only") || msg.includes("not awaiting payment")
        ? 400
        : msg.includes("not found")
          ? 404
          : 500;
    return NextResponse.json({ error: msg, code: error.code }, { status });
  }

  const row = parseDealRpcRow<{ buyer_payment_reported_at?: string | null }>(data);
  if (!row?.buyer_payment_reported_at) {
    return NextResponse.json(
      {
        error:
          "振込報告を保存できませんでした。Supabaseにマイグレーション036/042を適用してください。",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    buyer_payment_reported_at: row.buyer_payment_reported_at,
  });
}
