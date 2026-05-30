import { NextRequest, NextResponse } from "next/server";
import { buildDraftConditionComment, resolveVehicleClass } from "@/lib/ai-listing";
import { requireAiListingAccess } from "@/lib/ai-listing-auth";
import { normalizeVinStrict } from "@/lib/normalize";
import type { VehicleClass } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

type SaveItemInput = {
  id: string;
  maker: string;
  model: string;
  vehicle_class: VehicleClass;
  displacement_cc?: number | null;
  year?: number | null;
  mileage?: number | null;
  inspection_text?: string | null;
  insurance_text?: string | null;
  color?: string | null;
  frame_number: string;
  price_ex_tax: number;
  total_price_inc_tax?: number | null;
  repair_history?: string | null;
  warranty_text?: string | null;
  maintenance_text?: string | null;
  comment?: string | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAiListingAccess();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: jobId } = await params;
  const body = (await req.json()) as { items?: SaveItemInput[] };
  const items = body.items ?? [];
  if (items.length === 0) {
    return NextResponse.json({ error: "保存する車両を1件以上選択してください。" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: job } = await supabase
    .from("ai_listing_import_jobs")
    .select("id, status")
    .eq("id", jobId)
    .eq("seller_id", auth.userId)
    .maybeSingle();

  if (!job) return NextResponse.json({ error: "ジョブが見つかりません。" }, { status: 404 });
  if (job.status !== "completed") {
    return NextResponse.json({ error: "解析が完了していません。" }, { status: 400 });
  }

  const listingIds: string[] = [];
  let saved = 0;

  for (const item of items) {
    if (!item.id || !item.maker?.trim() || !item.model?.trim() || !item.vehicle_class) {
      return NextResponse.json({ error: "必須項目が不足している行があります。" }, { status: 400 });
    }
    const frame = normalizeVinStrict(item.frame_number);
    if (!frame) {
      return NextResponse.json({ error: "車体番号が不正な行があります。" }, { status: 400 });
    }
    if (!item.price_ex_tax || item.price_ex_tax <= 0) {
      return NextResponse.json({ error: "本体価格が不正な行があります。" }, { status: 400 });
    }

    const { data: draftRow } = await supabase
      .from("ai_listing_draft_items")
      .select("id, listing_id")
      .eq("id", item.id)
      .eq("job_id", jobId)
      .eq("seller_id", auth.userId)
      .maybeSingle();

    if (!draftRow) {
      return NextResponse.json({ error: `行 ${item.id} が見つかりません。` }, { status: 400 });
    }
    if (draftRow.listing_id) {
      listingIds.push(draftRow.listing_id);
      continue;
    }

    const conditionComment = buildDraftConditionComment(item);
    const cc = item.displacement_cc ?? null;

    const { data: listing, error: insertError } = await supabase
      .from("listings")
      .insert({
        seller_id: auth.userId,
        maker: item.maker.trim(),
        model: item.model.trim(),
        vehicle_class:
          item.vehicle_class ||
          resolveVehicleClass({
            maker: item.maker,
            model: item.model,
            displacement_cc: cc,
            comment: item.comment,
          }) ||
          "medium",
        displacement_cc: cc,
        year: item.year ?? null,
        mileage: item.mileage ?? null,
        frame_number: frame,
        price_ex_tax: item.price_ex_tax,
        condition_comment: conditionComment,
        inspection_remaining: item.inspection_text?.trim() || null,
        status: "draft",
      })
      .select("id")
      .single();

    if (insertError || !listing) {
      return NextResponse.json(
        { error: insertError?.message ?? "下書き作成に失敗しました。" },
        { status: 400 },
      );
    }

    await supabase
      .from("ai_listing_draft_items")
      .update({
        listing_id: listing.id,
        saved_at: new Date().toISOString(),
        maker: item.maker.trim(),
        model: item.model.trim(),
        displacement_cc: cc,
        year: item.year ?? null,
        mileage: item.mileage ?? null,
        inspection_text: item.inspection_text ?? null,
        insurance_text: item.insurance_text ?? null,
        color: item.color ?? null,
        frame_number: frame,
        price_ex_tax: item.price_ex_tax,
        total_price_inc_tax: item.total_price_inc_tax ?? null,
        repair_history: item.repair_history ?? null,
        warranty_text: item.warranty_text ?? null,
        maintenance_text: item.maintenance_text ?? null,
        comment: item.comment ?? null,
      })
      .eq("id", item.id);

    listingIds.push(listing.id);
    saved += 1;
  }

  const { count } = await supabase
    .from("ai_listing_draft_items")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .not("listing_id", "is", null);

  await supabase
    .from("ai_listing_import_jobs")
    .update({ saved_draft_count: count ?? saved })
    .eq("id", jobId);

  return NextResponse.json({
    savedCount: saved,
    listingIds,
    message:
      saved > 0
        ? `${saved}件の出品下書きを保存しました。写真と評価を追加してから公開してください。`
        : "選択した下書きは既に保存済みです。",
  });
}
