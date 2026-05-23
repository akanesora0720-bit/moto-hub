import { AppShell } from "@/components/AppShell";
import { canAccessAdmin } from "@/lib/auth";
import { getViewer } from "@/lib/viewer";
import type { Profile } from "@/lib/types";

/** サーバーページ用: ナビ表示に必要な viewer を1回だけ解決 */
export async function AuthenticatedShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();
  const profile = viewer?.profile;
  const showAdminNav = profile ? canAccessAdmin(profile as Profile) : false;

  return (
    <AppShell
      memberType={profile?.member_type ?? "dealer"}
      showAdminNav={showAdminNav}
      isAdmin={profile?.is_admin}
    >
      {children}
    </AppShell>
  );
}
