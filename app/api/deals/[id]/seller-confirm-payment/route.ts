import { NextResponse } from "next/server";
import { parseDealRpcRow } from "@/lib/parse-deal-rpc";
import { createClient } from "@/lib/supabase/server";

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

  const { data, error } = await supabase.rpc("seller_confirm_buyer_payment", {
    p_deal_id: dealId,
  });

  if (error) {
    const msg = error.message ?? "入金確認に失敗しました。";
    const status = msg.includes("seller only") || msg.includes("not awaiting payment")
      ? 400
      : 500;
    return NextResponse.json({ error: msg, code: error.code }, { status });
  }

  const row = parseDealRpcRow<{
    status?: string;
    seller_payment_confirmed_at?: string | null;
    funded_at?: string | null;
  }>(data);

  if (!row || row.status !== "funded") {
    return NextResponse.json(
      { error: "入金確認を保存できませんでした。Supabase マイグレーション 044 を適用してください。" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: row.status,
    seller_payment_confirmed_at: row.seller_payment_confirmed_at,
    funded_at: row.funded_at,
  });
}
