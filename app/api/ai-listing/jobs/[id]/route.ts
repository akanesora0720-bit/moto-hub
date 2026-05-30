import { NextRequest, NextResponse } from "next/server";
import { requireAiListingAccess } from "@/lib/ai-listing-auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAiListingAccess();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data: job, error } = await supabase
    .from("ai_listing_import_jobs")
    .select(
      "id, status, detected_count, saved_draft_count, error_message, source_filename, created_at, completed_at",
    )
    .eq("id", id)
    .eq("seller_id", auth.userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: items } = await supabase
    .from("ai_listing_draft_items")
    .select("*")
    .eq("job_id", id)
    .order("sort_order", { ascending: true });

  return NextResponse.json({ job, items: items ?? [] });
}
