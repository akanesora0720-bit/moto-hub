import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  const body = (await req.json()) as {
    buyer_id?: string;
    agreed_price_ex_tax?: number;
    shipping_bearer?: "buyer" | "seller" | "consult";
  };

  if (!body.buyer_id || !body.agreed_price_ex_tax || body.agreed_price_ex_tax <= 0) {
    return NextResponse.json({ error: "buyer_id と成約価格は必須です。" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("complete_part_sale", {
    p_part_listing_id: id,
    p_buyer_id: body.buyer_id,
    p_agreed_price_ex_tax: Number(body.agreed_price_ex_tax),
    p_shipping_bearer: body.shipping_bearer ?? "consult",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
