import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { InspectionRequestForm } from "@/components/InspectionRequestForm";
import { InspectionRequestList } from "@/components/InspectionRequestList";
import type { InspectionRequest } from "@/lib/inspection";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function InspectionsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.profile.member_type === "staff") redirect("/admin/inspections");

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("inspection_requests")
    .select("*")
    .eq("dealer_id", viewer.id)
    .order("created_at", { ascending: false });

  const requests = (rows ?? []) as InspectionRequest[];

  return (
    <AuthenticatedShell>
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <Link href="/home" className="text-sm text-muted hover:text-accent">
            ← ホーム
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Moto-Hub査定</h1>
          <p className="mt-1 text-sm text-muted">
            希望日時を送信後、スタッフとアプリ上で日程を調整します。確定後に現車査定・出品代行を行います。
          </p>
        </div>

        <InspectionRequestForm />

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted">依頼履歴</h2>
          <Suspense fallback={<p className="text-sm text-muted">読み込み中…</p>}>
            <InspectionRequestList initial={requests} />
          </Suspense>
        </section>
      </div>
    </AuthenticatedShell>
  );
}
