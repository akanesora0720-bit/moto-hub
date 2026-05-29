import type { SupabaseClient } from "@supabase/supabase-js";

export const PART_IMAGE_BUCKET = "part-images";
export const PART_CHAT_MAX_FILES = 6;
export const PART_LISTING_MAX_FILES = 8;

export function partListingImagePath(
  sellerId: string,
  listingId: string,
  fileName: string,
): string {
  return `${sellerId}/${listingId}/${fileName}`;
}

export function partChatImagePath(
  sellerId: string,
  listingId: string,
  inquiryId: string,
  fileName: string,
): string {
  return `${sellerId}/${listingId}/chat/${inquiryId}/${fileName}`;
}

export async function uploadPartFiles(
  supabase: SupabaseClient,
  paths: string[],
  files: File[],
): Promise<{ paths: string[]; error?: string }> {
  const uploaded: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = paths[i];
    const { error } = await supabase.storage.from(PART_IMAGE_BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type || undefined,
    });
    if (error) {
      if (uploaded.length > 0) {
        await supabase.storage.from(PART_IMAGE_BUCKET).remove(uploaded);
      }
      return { paths: [], error: error.message };
    }
    uploaded.push(path);
  }
  return { paths: uploaded };
}

export function partImagePathsFromJson(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is string => typeof p === "string" && p.length > 0);
}
