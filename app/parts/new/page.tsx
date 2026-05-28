import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { PartListingForm } from "@/components/PartListingForm";
import { canUseDealerTradingFeatures } from "@/lib/auth";
import { fetchPartCatalog } from "@/lib/part-catalog";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function NewPartPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", viewer.id)
    .maybeSingle();

  if (!canUseDealerTradingFeatures(profile)) {
    redirect("/home");
  }

  const { manufacturers, categories, error } = await fetchPartCatalog(supabase);

  return (
    <AuthenticatedShell>
      {error ? (
        <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          カタログを読み込めません。Supabase に 074 マイグレーションを適用してください。
        </p>
      ) : null}
      <PartListingForm manufacturers={manufacturers} categories={categories} />
    </AuthenticatedShell>
  );
}
