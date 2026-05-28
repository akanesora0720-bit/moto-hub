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

  const body = (await req.json()) as { message?: string };
  const message = (body.message ?? "").trim();
  if (message.length < 5) {
    return NextResponse.json({ error: "メッセージは5文字以上で入力してください。" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("create_part_inquiry", {
    p_part_listing_id: id,
    p_initial_message: message,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
