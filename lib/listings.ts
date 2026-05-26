import type { VehicleClass } from "@/lib/constants";
import { normalizeSellerPublicRow } from "@/lib/seller-public";
import type { ListingCard } from "@/lib/types";

type ListingRow = {
  id: string;
  seller_id: string;
  maker: string;
  model: string;
  vehicle_class: string | null;
  displacement_cc: number | null;
  year: number | null;
  mileage: number | null;
  frame_number: string;
  price_ex_tax: number;
  condition_comment: string;
  status: string;
  created_at: string;
  mileage_rollback: string;
  inspection_status: boolean;
  inspection_badge_type: string;
  grade_total: number | null;
  grade_engine: number | null;
  grade_front: number | null;
  grade_exterior: number | null;
  grade_rear: number | null;
  grade_electrical: number | null;
  grade_frame: number | null;
  inspection_remaining: string | null;
  engine_video_url: string | null;
  profiles_public: {
    id: string;
    prefecture: string | null;
    trust_score: number;
    trust_rank: string;
    verification_status: string;
  } | { id: string; prefecture: string | null; trust_score: number; trust_rank: string; verification_status: string }[] | null;
  listing_images: { storage_path: string; sort_order: number }[] | null;
};

export function mapListingRows(rows: ListingRow[]): ListingCard[] {
  return rows.map((row) => {
    const images = [...(row.listing_images ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
    const sellerPublic = normalizeSellerPublicRow(row.profiles_public);
    return {
      id: row.id,
      seller_id: row.seller_id,
      maker: row.maker,
      model: row.model,
      vehicle_class: (row.vehicle_class as VehicleClass | null) ?? null,
      displacement_cc: row.displacement_cc ?? null,
      year: row.year ?? null,
      mileage: row.mileage ?? null,
      frame_number: row.frame_number,
      mileage_rollback: (row.mileage_rollback ?? "none") as ListingCard["mileage_rollback"],
      price_ex_tax: row.price_ex_tax,
      condition_comment: row.condition_comment,
      status: row.status as ListingCard["status"],
      inspection_status: row.inspection_status ?? false,
      inspection_badge_type: (row.inspection_badge_type ?? "none") as ListingCard["inspection_badge_type"],
      grade_total: row.grade_total ?? null,
      grade_engine: row.grade_engine ?? null,
      grade_front: row.grade_front ?? null,
      grade_exterior: row.grade_exterior ?? null,
      grade_rear: row.grade_rear ?? null,
      grade_electrical: row.grade_electrical ?? null,
      grade_frame: row.grade_frame ?? null,
      inspection_remaining: row.inspection_remaining ?? null,
      inspection_expiry_date: null,
      liability_insurance_expiry_date: null,
      model_designation: null,
      engine_model: null,
      is_officially_stamped_vin: false,
      vin_note: null,
      engine_video_url: row.engine_video_url ?? null,
      created_at: row.created_at,
      cover_path: images[0]?.storage_path ?? null,
      seller_prefecture: sellerPublic?.prefecture ?? null,
      seller_trust_score: sellerPublic?.trust_score ?? 100,
      seller_trust_rank: (sellerPublic?.trust_rank ?? "GOLD") as ListingCard["seller_trust_rank"],
      seller_verification_status: (sellerPublic?.verification_status ??
        "unverified") as ListingCard["seller_verification_status"],
    };
  });
}
