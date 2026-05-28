import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { PartListingForm } from "@/components/PartListingForm";
import { canUseDealerTradingFeatures } from "@/lib/auth";
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

  return (
    <AuthenticatedShell>
      <PartListingForm />
    </AuthenticatedShell>
  );
}
