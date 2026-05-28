import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { canAccessAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPartsPage() {
  const viewer = await getViewer();
  if (!viewer || !canAccessAdmin(viewer.profile as Profile)) redirect("/");

  const supabase = await createClient();
  const { data } = await supabase
    .from("part_listings")
    .select("id, part_name, manufacturer, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <AuthenticatedShell mode="admin">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">管理: パーツ出品一覧</h1>
        <div className="space-y-2">
          {(data ?? []).map((p) => (
            <div key={p.id} className="rounded border border-border bg-card px-3 py-2 text-sm">
              <span className="font-medium">{p.part_name}</span>
              <span className="ml-2 text-muted">{p.manufacturer}</span>
              <span className="ml-2 text-accent">{p.status}</span>
            </div>
          ))}
          {(data ?? []).length === 0 ? <p className="text-sm text-muted">データなし</p> : null}
        </div>
      </div>
    </AuthenticatedShell>
  );
}
