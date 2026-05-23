import type { MileageRollbackStatus, VehicleClass } from "@/lib/constants";

export type { VehicleClass };

export type MemberType = "dealer" | "staff";

export type TrustRank = "GOLD" | "BLUE" | "YELLOW" | "RED";

export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";

export type Profile = {
  id: string;
  email: string;
  member_type: MemberType;
  store_name: string | null;
  contact_name: string | null;
  antique_dealer_number: string | null;
  invoice_number: string | null;
  prefecture: string | null;
  phone: string | null;
  trust_score: number;
  trust_rank: TrustRank;
  yearly_reset_at: string | null;
  is_banned: boolean;
  ban_reason: string | null;
  is_active: boolean;
  is_admin: boolean;
  profile_completed: boolean;
  verification_status: VerificationStatus;
  antique_dealer_doc_path: string | null;
  invoice_doc_path: string | null;
};

export type { MileageRollbackStatus };

export type ListingStatus = "active" | "sold" | "removed";

export type ListingGradeKey =
  | "total"
  | "engine"
  | "front"
  | "exterior"
  | "rear"
  | "electrical"
  | "frame";

/** フォーム用（未選択は空文字） */
export type ListingGrades = Record<ListingGradeKey, number | "">;

export type ListingGradesStored = Record<ListingGradeKey, number | null>;

export const EMPTY_LISTING_GRADES: ListingGrades = {
  total: "",
  engine: "",
  front: "",
  exterior: "",
  rear: "",
  electrical: "",
  frame: "",
};

export type Listing = {
  id: string;
  seller_id: string;
  maker: string;
  model: string;
  vehicle_class: VehicleClass | null;
  displacement_cc: number | null;
  year: number | null;
  mileage: number | null;
  frame_number: string;
  mileage_rollback: MileageRollbackStatus;
  price_ex_tax: number;
  condition_comment: string;
  status: ListingStatus;
  inspection_status: boolean;
  grade_total: number | null;
  grade_engine: number | null;
  grade_front: number | null;
  grade_exterior: number | null;
  grade_rear: number | null;
  grade_electrical: number | null;
  grade_frame: number | null;
  inspection_remaining: string | null;
  engine_video_url: string | null;
  created_at: string;
};

export type ListingImage = {
  id: string;
  listing_id: string;
  storage_path: string;
  sort_order: number;
};

export type ListingCard = Listing & {
  cover_path: string | null;
  seller_prefecture: string | null;
  seller_trust_score: number;
  seller_trust_rank: TrustRank;
  seller_verification_status: VerificationStatus;
};

export type DealStatus =
  | "inquiry"
  | "negotiating"
  | "agreed"
  | "awaiting_payment"
  | "funded"
  | "handover_done"
  | "transfer_pending"
  | "payout_ready"
  | "payout_done"
  | "completed"
  | "cancelled"
  | "dispute";

export type Deal = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  agreed_price_ex_tax: number;
  status: DealStatus;
  seller_fee_rate: number;
  buyer_fee_rate: number;
  inquiry_id: string | null;
  handover_at: string | null;
  funded_at: string | null;
  transfer_deadline_at: string | null;
  requires_name_transfer: boolean;
  buyer_confirmed_at: string | null;
  seller_confirmed_at: string | null;
  payout_at: string | null;
  transfer_overdue: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ComplaintStatus = "pending" | "approved" | "rejected";

export type ComplaintType =
  | "minor_condition"
  | "undisclosed_damage"
  | "major_misrepresentation"
  | "mileage_issue"
  | "transfer_delay"
  | "theft_issue";

export type Complaint = {
  id: string;
  deal_id: string | null;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  complaint_type: ComplaintType;
  description: string;
  penalty_score: number;
  status: ComplaintStatus;
  created_at: string;
};

export type DisputeCategory =
  | "doc_delay"
  | "transfer_delay"
  | "false_claim"
  | "defect"
  | "no_contact"
  | "fraud";

export type DisputeStatus = "open" | "reviewing" | "resolved" | "rejected";

export type Dispute = {
  id: string;
  deal_id: string;
  reporter_id: string;
  target_user_id: string;
  category: DisputeCategory;
  message: string;
  images: string[];
  status: DisputeStatus;
  resolution: string | null;
  penalty_points: number | null;
  created_at: string;
};

export type PenaltyLog = {
  id: string;
  user_id: string;
  reason: string;
  score_delta: number;
  deal_id: string | null;
  created_at: string;
};

export type DealerDashboardStats = {
  listing_count: number;
  completed_count: number;
  completion_rate: number;
  avg_completed_price: number;
  inspected_count: number;
  avg_listing_days: number;
  monthly_sales_ex_tax: number;
};

export type MemberStats = {
  completed_deals: number;
  total_listings: number;
  inspected_listings: number;
};
