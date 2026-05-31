import { NextRequest, NextResponse } from "next/server";
import { syncDealGeneratedDocuments } from "@/lib/deal-document-sync";
import { canAccessAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/server-supabase";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 取引書類を Storage に同期（当事者または運営） */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: dealId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, member_type, is_active")
    .eq("id", user.id)
    .maybeSingle();

  const { data: deal } = await supabase
    .from("deals")
    .select("buyer_id, seller_id")
    .eq("id", dealId)
    .maybeSingle();

  if (!deal) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const isParty = deal.buyer_id === user.id || deal.seller_id === user.id;
  const isAdmin = canAccessAdmin(profile as Profile | null);
  if (!isParty && !isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const service = createServiceClient();
  const result = await syncDealGeneratedDocuments(service, dealId);
  return NextResponse.json({ ok: true, dealId, ...result });
}
