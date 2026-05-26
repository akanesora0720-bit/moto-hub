import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { DealerMembershipBanner } from "@/components/DealerMembershipBanner";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MembershipRejectedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_status, member_type, profile_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.member_type !== "dealer") redirect("/home");
  if (profile.account_status !== "rejected") redirect("/home");

  return (
    <AuthenticatedShell>
      <div className="mx-auto max-w-lg space-y-6">
        <h1 className="text-2xl font-semibold">加盟審査結果</h1>
        <DealerMembershipBanner
          accountStatus={profile.account_status}
          profileCompleted={profile.profile_completed ?? false}
        />
        <p className="text-sm text-muted">
          <Link href="/settings" className="text-accent underline">
            設定
          </Link>
          から連絡先をご確認ください。
        </p>
      </div>
    </AuthenticatedShell>
  );
}
