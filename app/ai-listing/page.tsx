import { redirect } from "next/navigation";
import { AiListingImportWizard } from "@/components/AiListingImportWizard";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { isAiListingOpenAiConfigured } from "@/lib/ai-listing-config";
import { canUseDealerTradingFeatures } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function AiListingPage() {
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
      <AiListingImportWizard aiConfigured={isAiListingOpenAiConfigured()} />
    </AuthenticatedShell>
  );
}
