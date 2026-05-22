import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { VehicleGradingSlide } from "@/components/VehicleGradingSlide";
import { createClient } from "@/lib/supabase/server";

export default async function EvaluationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("is_admin, member_type")
        .eq("id", user.id)
        .single()
    : { data: null };

  const showAdmin =
    profile?.is_admin === true || profile?.member_type === "staff";

  return (
    <AppShell isAdmin={showAdmin}>
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/" className="text-sm text-muted hover:text-accent">
          ← 在庫一覧
        </Link>
        <VehicleGradingSlide />
      </div>
    </AppShell>
  );
}
