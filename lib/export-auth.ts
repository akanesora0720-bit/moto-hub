import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/server-supabase";

export async function getExportViewer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const adminClient = createServiceClient();
  const { data: profile } = await adminClient
    .from("profiles")
    .select("id, member_type, store_name, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin =
    profile?.is_admin === true || profile?.member_type === "staff";
  return { userId: user.id, isAdmin, supabase: adminClient };
}
