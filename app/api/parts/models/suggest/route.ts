import { NextRequest, NextResponse } from "next/server";
import { fetchPartModelSuggestions } from "@/lib/part-catalog";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const manufacturerId = req.nextUrl.searchParams.get("manufacturer_id")?.trim();
  if (!manufacturerId) {
    return NextResponse.json({ error: "manufacturer_id が必要です。" }, { status: 400 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const { suggestions, error } = await fetchPartModelSuggestions(supabase, manufacturerId, q);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ suggestions });
}
