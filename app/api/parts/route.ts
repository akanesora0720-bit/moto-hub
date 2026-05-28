import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  const body = (await req.json()) as {
    part_name?: string;
    manufacturer?: string;
    compatible_models?: string;
    category?: string;
    part_condition?: string;
    description?: string;
    price_display_type?: "fixed" | "ask";
    price_ex_tax?: number | null;
    shipping_bearer?: "buyer" | "seller" | "consult";
  };

  const priceType = body.price_display_type ?? "fixed";
  const price = priceType === "fixed" ? Number(body.price_ex_tax ?? 0) : null;

  const { data, error } = await supabase
    .from("part_listings")
    .insert({
      seller_id: user.id,
      part_name: (body.part_name ?? "").trim(),
      manufacturer: (body.manufacturer ?? "").trim(),
      compatible_models: (body.compatible_models ?? "").trim(),
      category: (body.category ?? "").trim(),
      part_condition: (body.part_condition ?? "").trim() || "中古",
      description: (body.description ?? "").trim(),
      price_display_type: priceType,
      price_ex_tax: price,
      shipping_bearer: body.shipping_bearer ?? "buyer",
      status: "active",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}
