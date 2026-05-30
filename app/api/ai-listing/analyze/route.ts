import { NextRequest, NextResponse } from "next/server";
import {
  AI_LISTING_ACCEPTED_MIME,
  AI_LISTING_MAX_BYTES,
  requireAiListingAccess,
} from "@/lib/ai-listing-auth";
import { extractVehiclesFromImage } from "@/lib/openai/vision-listing-extract";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const auth = await requireAiListingAccess();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "画像ファイルを指定してください。" }, { status: 400 });
  }

  const mime =
    file.type === "image/jpg" ? "image/jpeg" : file.type || "application/octet-stream";
  if (!AI_LISTING_ACCEPTED_MIME.has(mime)) {
    return NextResponse.json(
      { error: "PNG / JPG / JPEG のみ対応しています。" },
      { status: 400 },
    );
  }
  if (file.size > AI_LISTING_MAX_BYTES) {
    return NextResponse.json({ error: "ファイルは10MB以下にしてください。" }, { status: 400 });
  }

  const supabase = await createClient();
  const jobId = randomUUID();
  const ext = mime === "image/png" ? "png" : "jpg";
  const storagePath = `${auth.userId}/${jobId}/source.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("ai-listing-imports")
    .upload(storagePath, buffer, { contentType: mime, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const { data: job, error: jobError } = await supabase
    .from("ai_listing_import_jobs")
    .insert({
      id: jobId,
      seller_id: auth.userId,
      source_filename: file.name,
      storage_path: storagePath,
      mime_type: mime,
      status: "processing",
    })
    .select("id")
    .single();

  if (jobError || !job) {
    await supabase.storage.from("ai-listing-imports").remove([storagePath]);
    return NextResponse.json({ error: jobError?.message ?? "ジョブ作成に失敗" }, { status: 500 });
  }

  try {
    const extracted = await extractVehiclesFromImage(buffer.toString("base64"), mime);

    const itemRows = extracted.vehicles.map((v, i) => ({
      job_id: jobId,
      seller_id: auth.userId,
      sort_order: i,
      maker: v.maker,
      model: v.model,
      displacement_cc: v.displacement_cc,
      year: v.year,
      mileage: v.mileage,
      inspection_text: v.inspection_text,
      insurance_text: v.insurance_text,
      color: v.color,
      frame_number: v.frame_number,
      price_ex_tax: v.price_ex_tax,
      total_price_inc_tax: v.total_price_inc_tax,
      repair_history: v.repair_history,
      warranty_text: v.warranty_text,
      maintenance_text: v.maintenance_text,
      comment: v.comment,
      field_confidence: v.confidence,
      raw_extract: v,
    }));

    let insertedItems: Record<string, unknown>[] = [];
    if (itemRows.length > 0) {
      const { data: rows, error: itemsError } = await supabase
        .from("ai_listing_draft_items")
        .insert(itemRows)
        .select("*");
      if (itemsError) throw new Error(itemsError.message);
      insertedItems = rows ?? [];
    }

    await supabase
      .from("ai_listing_import_jobs")
      .update({
        status: "completed",
        detected_count: insertedItems.length,
        model_name: extracted.model,
        prompt_tokens: extracted.promptTokens,
        completion_tokens: extracted.completionTokens,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return NextResponse.json({
      jobId,
      detectedCount: insertedItems.length,
      items: insertedItems,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase
      .from("ai_listing_import_jobs")
      .update({
        status: "failed",
        error_message: message.slice(0, 2000),
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return NextResponse.json({ error: message, jobId }, { status: 502 });
  }
}
