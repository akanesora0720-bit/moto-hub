import { MAKERS, VEHICLE_CLASSES, type VehicleClass } from "@/lib/constants";

export const LISTINGS_PAGE_SIZE = 24;

export type ListingSearchQuery = {
  maker?: string;
  model?: string;
  frame?: string;
  vehicle_class?: string;
  motohub_only?: string;
  page?: string;
};

export type ParsedListingSearch = {
  page: number;
  maker?: string;
  vehicleClass?: VehicleClass;
  model?: string;
  frameNumber?: string;
  motohubOnly?: boolean;
};

export function parseListingSearch(query: ListingSearchQuery): ParsedListingSearch {
  const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
  const makerRaw = query.maker?.trim();
  const maker =
    makerRaw && (MAKERS as readonly string[]).includes(makerRaw) ? makerRaw : undefined;

  const model = query.model?.trim() || undefined;
  const frameNumber = query.frame?.trim() || undefined;
  const vcRaw = query.vehicle_class?.trim();
  const vehicleClass =
    vcRaw && VEHICLE_CLASSES.some((v) => v.value === vcRaw)
      ? (vcRaw as VehicleClass)
      : undefined;

  const motohubOnly =
    query.motohub_only === "1" ||
    query.motohub_only === "true" ||
    query.motohub_only === "on";

  return { page, maker, vehicleClass, model, frameNumber, motohubOnly };
}

/** PostgREST ilike 用（% _ をエスケープ） */
export function escapeIlikePattern(value: string): string {
  return value.replace(/[%_\\]/g, (c) => `\\${c}`);
}

export function listingSearchHref(
  params: ParsedListingSearch & { page?: number },
  basePath = "/search",
): string {
  const sp = new URLSearchParams();
  if (params.maker) sp.set("maker", params.maker);
  if (params.vehicleClass) sp.set("vehicle_class", params.vehicleClass);
  if (params.model) sp.set("model", params.model);
  if (params.frameNumber) sp.set("frame", params.frameNumber);
  if (params.motohubOnly) sp.set("motohub_only", "1");
  const page = params.page ?? 1;
  if (page > 1) sp.set("page", String(page));
  const q = sp.toString();
  return q ? `${basePath}?${q}` : basePath;
}
