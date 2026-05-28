import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeIlikePattern } from "@/lib/listing-search";
import { normalizePartCatalogText } from "@/lib/part-normalize";

export const PARTS_PAGE_SIZE = 24;

export type PartSearchQuery = {
  manufacturer_id?: string;
  category_id?: string;
  model?: string;
  keyword?: string;
  mpn?: string;
  exclude_ask?: string;
  price_min?: string;
  price_max?: string;
  page?: string;
};

export type ParsedPartSearch = {
  page: number;
  manufacturerId?: string;
  categoryId?: string;
  model?: string;
  keyword?: string;
  mpn?: string;
  excludeAsk: boolean;
  priceMin?: number;
  priceMax?: number;
};

export function parsePartSearch(query: PartSearchQuery): ParsedPartSearch {
  const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
  const manufacturerId = query.manufacturer_id?.trim() || undefined;
  const categoryId = query.category_id?.trim() || undefined;
  const modelRaw = query.model?.trim();
  const model = modelRaw ? normalizePartCatalogText(modelRaw) : undefined;
  const keyword = query.keyword?.trim() || undefined;
  const mpnRaw = query.mpn?.trim();
  const mpn = mpnRaw ? normalizePartCatalogText(mpnRaw) : undefined;
  const excludeAsk =
    query.exclude_ask === "1" || query.exclude_ask === "true" || query.exclude_ask === "on";
  const priceMinRaw = query.price_min?.trim();
  const priceMaxRaw = query.price_max?.trim();
  const priceMin = priceMinRaw ? Math.max(0, parseInt(priceMinRaw, 10) || 0) : undefined;
  const priceMax = priceMaxRaw ? Math.max(0, parseInt(priceMaxRaw, 10) || 0) : undefined;

  return {
    page,
    manufacturerId,
    categoryId,
    model,
    keyword,
    mpn,
    excludeAsk,
    priceMin: priceMin && priceMin > 0 ? priceMin : undefined,
    priceMax: priceMax && priceMax > 0 ? priceMax : undefined,
  };
}

export function partSearchHref(
  params: ParsedPartSearch & { page?: number },
  basePath = "/parts",
): string {
  const sp = new URLSearchParams();
  if (params.manufacturerId) sp.set("manufacturer_id", params.manufacturerId);
  if (params.categoryId) sp.set("category_id", params.categoryId);
  if (params.model) sp.set("model", params.model);
  if (params.keyword) sp.set("keyword", params.keyword);
  if (params.mpn) sp.set("mpn", params.mpn);
  if (params.excludeAsk) sp.set("exclude_ask", "1");
  if (params.priceMin) sp.set("price_min", String(params.priceMin));
  if (params.priceMax) sp.set("price_max", String(params.priceMax));
  const page = params.page ?? 1;
  if (page > 1) sp.set("page", String(page));
  const q = sp.toString();
  return q ? `${basePath}?${q}` : basePath;
}

export function partSearchHasFilters(search: ParsedPartSearch): boolean {
  return !!(
    search.manufacturerId ||
    search.categoryId ||
    search.model ||
    search.keyword ||
    search.mpn ||
    search.excludeAsk ||
    search.priceMin ||
    search.priceMax
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyPartSearchFilters(query: any, search: ParsedPartSearch) {
  let q = query;
  q = q.in("status", ["active", "negotiating"]);

  if (search.manufacturerId) q = q.eq("manufacturer_id", search.manufacturerId);
  if (search.categoryId) q = q.eq("category_id", search.categoryId);
  if (search.excludeAsk) q = q.eq("price_display_type", "fixed");
  if (search.priceMin != null) q = q.gte("price_ex_tax", search.priceMin);
  if (search.priceMax != null) q = q.lte("price_ex_tax", search.priceMax);

  if (search.keyword) {
    const pat = `%${escapeIlikePattern(search.keyword)}%`;
    q = q.or(`part_name.ilike.${pat},description.ilike.${pat}`);
  }

  if (search.mpn) {
    const pat = `%${escapeIlikePattern(search.mpn)}%`;
    q = q.ilike("manufacturer_part_number_normalized", pat);
  }

  return q;
}

export async function fetchPartListings(
  supabase: SupabaseClient,
  search: ParsedPartSearch,
) {
  const from = (search.page - 1) * PARTS_PAGE_SIZE;
  const to = from + PARTS_PAGE_SIZE - 1;

  let modelIds: string[] | null = null;
  if (search.model) {
    let modelQuery = supabase
      .from("part_models")
      .select("id")
      .ilike("normalized_name", `%${escapeIlikePattern(search.model)}%`)
      .eq("is_universal", false);
    if (search.manufacturerId) {
      modelQuery = modelQuery.eq("manufacturer_id", search.manufacturerId);
    }
    const { data: modelRows } = await modelQuery.limit(200);
    modelIds = (modelRows ?? []).map((r) => r.id as string);
  }

  let query = supabase
    .from("part_listings")
    .select(
      `
      id,
      part_name,
      manufacturer,
      category,
      model_display_name,
      compatible_models,
      is_universal_model,
      manufacturer_part_number,
      price_display_type,
      price_ex_tax,
      shipping_bearer,
      status,
      created_at,
      part_manufacturers ( label ),
      part_categories ( label ),
      part_models ( display_name, normalized_name, is_universal )
    `,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  query = applyPartSearchFilters(query, search);

  if (search.model) {
    const parts: string[] = ["is_universal_model.eq.true"];
    if (modelIds && modelIds.length > 0) {
      parts.push(`part_model_id.in.(${modelIds.join(",")})`);
    }
    query = query.or(parts.join(","));
  }

  return query;
}
