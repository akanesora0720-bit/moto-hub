import type { SupabaseClient } from "@supabase/supabase-js";
import {
  escapeIlikePattern,
  LISTINGS_PAGE_SIZE,
  type ParsedListingSearch,
} from "@/lib/listing-search";
import { LISTING_SELLER_PUBLIC_SELECT } from "@/lib/seller-public";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyListingSearchFilters(query: any, search: ParsedListingSearch) {
  let q = query;
  if (search.maker) q = q.eq("maker", search.maker);
  if (search.vehicleClass) q = q.eq("vehicle_class", search.vehicleClass);
  if (search.model) q = q.ilike("model", `%${escapeIlikePattern(search.model)}%`);
  if (search.frameNumber) {
    q = q.ilike("frame_number", `%${escapeIlikePattern(search.frameNumber)}%`);
  }
  if (search.motohubOnly) {
    q = q.eq("inspection_badge_type", "motohub_inspected");
  }
  return q;
}

export async function fetchActiveListings(
  supabase: SupabaseClient,
  search: ParsedListingSearch,
) {
  const from = (search.page - 1) * LISTINGS_PAGE_SIZE;
  const to = from + LISTINGS_PAGE_SIZE - 1;

  let query = supabase
    .from("listings")
    .select(
      `
      *,
      ${LISTING_SELLER_PUBLIC_SELECT},
      listing_images ( storage_path, sort_order )
    `,
      { count: "exact" },
    )
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .range(from, to);

  query = applyListingSearchFilters(query, search);

  return query;
}
