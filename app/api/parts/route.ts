import { NextRequest, NextResponse } from "next/server";
import { normalizePartCatalogText } from "@/lib/part-normalize";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  const body = (await req.json()) as {
    manufacturer_id?: string;
    category_id?: string;
    model_display_name?: string;
    is_universal_model?: boolean;
    part_name?: string;
    manufacturer_part_number?: string;
    part_condition?: string;
    description?: string;
    price_display_type?: "fixed" | "ask";
    price_ex_tax?: number | null;
    shipping_bearer?: "buyer" | "seller" | "consult";
  };

  const manufacturerId = body.manufacturer_id?.trim();
  const categoryId = body.category_id?.trim();
  if (!manufacturerId || !categoryId) {
    return NextResponse.json(
      { error: "メーカーとカテゴリを選択してください。" },
      { status: 400 },
    );
  }

  const isUniversal = !!body.is_universal_model;
  const modelDisplay = isUniversal ? "汎用" : (body.model_display_name ?? "").trim();
  if (!isUniversal && !modelDisplay) {
    return NextResponse.json({ error: "対応車種を入力してください。" }, { status: 400 });
  }

  const priceType = body.price_display_type ?? "fixed";
  const price = priceType === "fixed" ? Number(body.price_ex_tax ?? 0) : null;
  if (priceType === "fixed" && price !== null && price <= 0) {
    return NextResponse.json({ error: "価格（税抜）を入力してください。" }, { status: 400 });
  }

  const mpnRaw = (body.manufacturer_part_number ?? "").trim();
  const mpnNormalized = mpnRaw ? normalizePartCatalogText(mpnRaw) : "";

  const { data, error } = await supabase
    .from("part_listings")
    .insert({
      seller_id: user.id,
      manufacturer_id: manufacturerId,
      category_id: categoryId,
      is_universal_model: isUniversal,
      model_display_name: modelDisplay,
      part_name: (body.part_name ?? "").trim(),
      manufacturer_part_number: mpnRaw,
      manufacturer_part_number_normalized: mpnNormalized,
      part_condition: (body.part_condition ?? "").trim() || "中古",
      description: (body.description ?? "").trim(),
      price_display_type: priceType,
      price_ex_tax: price,
      shipping_bearer: body.shipping_bearer ?? "buyer",
      status: "active",
      manufacturer: "",
      category: "",
      compatible_models: "",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}
