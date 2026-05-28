import type { SupabaseClient } from "@supabase/supabase-js";

export type PartManufacturer = { id: string; slug: string; label: string; sort_order: number };
export type PartCategory = { id: string; slug: string; label: string; sort_order: number };
export type PartModelSuggestion = {
  id: string;
  display_name: string;
  normalized_name: string;
  is_universal: boolean;
  usage_count: number;
};

export async function fetchPartCatalog(supabase: SupabaseClient) {
  const [mfgRes, catRes] = await Promise.all([
    supabase
      .from("part_manufacturers")
      .select("id, slug, label, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("part_categories")
      .select("id, slug, label, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  return {
    manufacturers: (mfgRes.data ?? []) as PartManufacturer[],
    categories: (catRes.data ?? []) as PartCategory[],
    error: mfgRes.error ?? catRes.error,
  };
}

export async function fetchPartModelSuggestions(
  supabase: SupabaseClient,
  manufacturerId: string,
  query: string,
  limit = 15,
) {
  let q = supabase
    .from("part_models")
    .select("id, display_name, normalized_name, is_universal, usage_count")
    .eq("manufacturer_id", manufacturerId)
    .order("usage_count", { ascending: false })
    .limit(limit);

  const normalized = query.trim().toUpperCase().replace(/[\s\u3000]+/g, "");
  if (normalized) {
    q = q.ilike("normalized_name", `${normalized}%`);
  } else {
    q = q.eq("is_universal", false);
  }

  const { data, error } = await q;
  return { suggestions: (data ?? []) as PartModelSuggestion[], error };
}

export function partModelLabel(row: {
  is_universal_model?: boolean;
  model_display_name?: string | null;
  compatible_models?: string | null;
}): string {
  if (row.is_universal_model) return "汎用";
  return row.model_display_name?.trim() || row.compatible_models?.trim() || "—";
}
