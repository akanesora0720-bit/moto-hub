import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ListingEditorForm } from "@/components/ListingEditorForm";
import { canAccessAdmin, canPerformMotohubInspection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import type { Profile } from "@/lib/types";

export default async function AdminInspectionRegisterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer || !canAccessAdmin(viewer.profile as Profile)) redirect("/home");
  if (!canPerformMotohubInspection(viewer.profile as Profile)) redirect("/home");

  const supabase = await createClient();
  const { data: req } = await supabase
    .from("inspection_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!req) notFound();
  if (req.status !== "in_progress") {
    redirect("/admin/inspections");
  }

  const { data: dealer } = await supabase
    .from("profiles")
    .select("store_name")
    .eq("id", req.dealer_id)
    .maybeSingle();

  return (
    <AppShell mode="admin">
      <div className="mx-auto max-w-xl space-y-4">
        <Link href="/admin/inspections" className="text-sm text-muted hover:text-accent">
          ← 査定依頼一覧
        </Link>
        <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-4 text-sm">
          <p className="font-medium text-sky-100">出品代行（Moto-Hub査定済）</p>
          <p className="mt-1 text-muted">
            {req.vehicle_name} · {dealer?.store_name ?? "加盟店"} · {req.storage_location}
          </p>
          <p className="mt-2 text-xs">
            登録完了後、自動で「Moto-Hub査定済」バッジを付与し依頼を完了にします。
          </p>
        </div>
        <ListingEditorForm
          mode="create"
          embedded
          sellerIdOverride={req.dealer_id}
          inspectionRequestId={id}
          cancelHref="/admin/inspections"
        />
      </div>
    </AppShell>
  );
}
