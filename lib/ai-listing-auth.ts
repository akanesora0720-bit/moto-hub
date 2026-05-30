import { canUseDealerTradingFeatures } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export async function requireAiListingAccess(): Promise<
  { ok: true; userId: string; profile: Profile } | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "ログインが必要です。" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!canUseDealerTradingFeatures(profile as Profile | null)) {
    return { ok: false, status: 403, error: "加盟審査承認後の加盟店のみ利用できます。" };
  }

  return { ok: true, userId: user.id, profile: profile as Profile };
}

export const AI_LISTING_ACCEPTED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
]);

export const AI_LISTING_MAX_BYTES = 10 * 1024 * 1024;
