import { NextRequest, NextResponse } from "next/server";
import { fetchAdminPendingCounts } from "@/lib/admin-pending-counts";
import { fetchDealerActionStats } from "@/lib/dealer-action-stats";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get("scope") ?? "dealer";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({});
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, member_type")
    .eq("id", user.id)
    .maybeSingle();

  const canAdmin =
    profile?.is_admin === true || profile?.member_type === "staff";

  if (scope === "admin" && canAdmin) {
    try {
      const pending = await fetchAdminPendingCounts();
      return NextResponse.json({
        openInquiries: pending.openInquiries,
        openSupport: pending.openSupport,
        openDisputes: pending.openDisputes,
        invoicesReviewPending: pending.invoicesReviewPending,
        payoutsAwaiting: pending.payoutsAwaiting,
      });
    } catch {
      return NextResponse.json({});
    }
  }

  try {
    const stats = await fetchDealerActionStats(user.id);
    return NextResponse.json({
      negotiating: stats.negotiating,
      newInquiries: stats.newInquiries,
      unreadNotifications: stats.unreadNotifications,
    });
  } catch {
    return NextResponse.json({});
  }
}
