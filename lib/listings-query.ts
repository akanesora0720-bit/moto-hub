import type { SupabaseClient } from "@supabase/supabase-js";
import {
  escapeIlikePattern,
  LISTINGS_PAGE_SIZE,
  type ParsedListingSearch,
} from "@/lib/listing-search";
import { prefecturesInListingSearchRegion } from "@/lib/prefectures";
import { LISTING_SELLER_PUBLIC_SELECT } from "@/lib/seller-public";

const LISTING_SELLER_PUBLIC_INNER_SELECT =
  "profiles_public!inner ( id, prefecture, trust_score, trust_rank, verification_status )";

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
  if (search.prefecture) {
    q = q.eq("profiles_public.prefecture", search.prefecture);
  } else if (search.region) {
    const prefs = [...prefecturesInListingSearchRegion(search.region)];
    if (prefs.length > 0) {
      q = q.in("profiles_public.prefecture", prefs);
    }
  }
  return q;
}

export function listingSearchUsesAreaFilter(search: ParsedListingSearch): boolean {
  return !!(search.prefecture || search.region);
}

export async function fetchActiveListings(
  supabase: SupabaseClient,
  search: ParsedListingSearch,
) {
  const from = (search.page - 1) * LISTINGS_PAGE_SIZE;
  const to = from + LISTINGS_PAGE_SIZE - 1;

  const areaFilter = listingSearchUsesAreaFilter(search);
  const sellerSelect = areaFilter ? LISTING_SELLER_PUBLIC_INNER_SELECT : LISTING_SELLER_PUBLIC_SELECT;

  let query = supabase
    .from("listings")
    .select(
      `
      *,
      ${sellerSelect},
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
