import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type InquiryBody = {
  message?: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: listingId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  let body: InquiryBody;
  try {
    body = (await req.json()) as InquiryBody;
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const message = body.message?.trim() ?? "";
  if (message.length < 5) {
    return NextResponse.json(
      { error: "メッセージは5文字以上で入力してください。" },
      { status: 400 },
    );
  }

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id, seller_id, status")
    .eq("id", listingId)
    .maybeSingle();

  if (listingError) {
    return NextResponse.json({ error: listingError.message }, { status: 500 });
  }
  if (!listing) {
    return NextResponse.json({ error: "出品が見つかりません。" }, { status: 404 });
  }
  if (listing.seller_id === user.id) {
    return NextResponse.json(
      { error: "自分の出品には問い合わせできません。" },
      { status: 403 },
    );
  }

  const { data, error } = await supabase.rpc("create_active_deal", {
    p_listing_id: listingId,
    p_buyer_id: user.id,
    p_seller_id: listing.seller_id,
    p_initial_message: message,
  });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("negotiation") || m.includes("under negotiation")) {
      return NextResponse.json(
        { error: "この車両は現在商談中です。" },
        { status: 409 },
      );
    }
    if (m.includes("not available")) {
      return NextResponse.json(
        { error: "この車両は問い合わせできません。" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
