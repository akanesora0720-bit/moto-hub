import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { AccountStatus, MemberType } from "@/lib/types";

export type ViewerProfile = {
  profile_completed: boolean;
  is_active: boolean;
  is_banned: boolean;
  is_admin: boolean;
  member_type: MemberType;
  account_status: AccountStatus | null;
};

export type Viewer = {
  id: string;
  profile: ViewerProfile;
};

function encodeProfile(profile: ViewerProfile): string {
  return Buffer.from(JSON.stringify(profile)).toString("base64url");
}

export function decodeProfileHeader(raw: string | null): ViewerProfile | null {
  if (!raw) return null;
  try {
    return JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as ViewerProfile;
  } catch {
    return null;
  }
}

export { encodeProfile };

/** 同一リクエスト内で dedupe。Middleware が載せたヘッダーを優先し DB 往復を減らす */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const h = await headers();
  const id = h.get("x-mh-uid");
  const profile = decodeProfileHeader(h.get("x-mh-profile"));
  if (id && profile) return { id, profile };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: row } = await supabase
    .from("profiles")
    .select(
      "profile_completed, is_active, is_banned, is_admin, member_type, account_status",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!row) return null;
  return {
    id: user.id,
    profile: row as ViewerProfile,
  };
});
