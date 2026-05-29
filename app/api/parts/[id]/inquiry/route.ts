import { NextRequest, NextResponse } from "next/server";
import {
  partChatImagePath,
  partImagePathsFromJson,
  PART_CHAT_MAX_FILES,
  PART_IMAGE_BUCKET,
  uploadPartFiles,
} from "@/lib/part-images";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: partListingId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";
  let message = "";
  let files: File[] = [];

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    message = String(form.get("message") ?? "").trim();
    const picked = form.getAll("images").filter((v): v is File => v instanceof File && v.size > 0);
    files = picked.slice(0, PART_CHAT_MAX_FILES);
  } else {
    const body = (await req.json()) as { message?: string; attachment_paths?: unknown };
    message = (body.message ?? "").trim();
    const paths = partImagePathsFromJson(body.attachment_paths);
    if (paths.length > PART_CHAT_MAX_FILES) {
      return NextResponse.json({ error: "添付は6枚までです。" }, { status: 400 });
    }

    const { data: listing } = await supabase
      .from("part_listings")
      .select("seller_id")
      .eq("id", partListingId)
      .maybeSingle();

    if (!listing) {
      return NextResponse.json({ error: "出品が見つかりません。" }, { status: 404 });
    }

    const { data, error } = await supabase.rpc("create_part_inquiry", {
      p_part_listing_id: partListingId,
      p_initial_message: message,
      p_attachment_paths: paths,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  }

  if (message.length < 5 && files.length === 0) {
    return NextResponse.json(
      { error: "メッセージは5文字以上、または写真を添付してください。" },
      { status: 400 },
    );
  }

  const { data: listing, error: listingError } = await supabase
    .from("part_listings")
    .select("seller_id")
    .eq("id", partListingId)
    .maybeSingle();

  if (listingError) {
    return NextResponse.json({ error: listingError.message }, { status: 500 });
  }
  if (!listing) {
    return NextResponse.json({ error: "出品が見つかりません。" }, { status: 404 });
  }

  const { data: inquiry, error: inquiryError } = await supabase.rpc("create_part_inquiry", {
    p_part_listing_id: partListingId,
    p_initial_message: message.length >= 5 ? message : "（写真付き問い合わせ）",
    p_attachment_paths: [],
  });

  if (inquiryError || !inquiry) {
    return NextResponse.json({ error: inquiryError?.message ?? "問い合わせの作成に失敗しました。" }, { status: 400 });
  }

  const inquiryId = (inquiry as { id: string }).id;
  const sellerId = listing.seller_id as string;

  if (files.length > 0) {
    const paths = files.map((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() || "jpg";
      const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
      return partChatImagePath(sellerId, partListingId, inquiryId, `${crypto.randomUUID()}.${safeExt}`);
    });
    const uploaded = await uploadPartFiles(supabase, paths, files);
    if (uploaded.error) {
      return NextResponse.json({ error: uploaded.error }, { status: 400 });
    }
    const { error: attachError } = await supabase.rpc(
      "set_part_inquiry_first_message_attachments",
      {
        p_inquiry_id: inquiryId,
        p_attachment_paths: uploaded.paths,
      },
    );
    if (attachError) {
      await supabase.storage.from(PART_IMAGE_BUCKET).remove(uploaded.paths);
      return NextResponse.json({ error: attachError.message }, { status: 400 });
    }
  }

  return NextResponse.json(inquiry);
}
