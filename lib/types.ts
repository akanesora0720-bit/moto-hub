import type { InspectionBadgeType } from "@/lib/inspection";
import type { MileageRollbackStatus, VehicleClass } from "@/lib/constants";

export type { VehicleClass };

export type MemberType = "dealer" | "staff";

export type TrustRank = "GOLD" | "BLUE" | "YELLOW" | "RED";

export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";

export type AccountStatus =
  | "pre_registered"
  | "pending_review"
  | "approved"
  | "rejected"
  | "suspended";

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
  account_status: AccountStatus | null;
  contract_established_at: string | null;
  antique_dealer_doc_path: string | null;
  invoice_doc_path: string | null;
  trade_name: string | null;
  address: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account_type: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
  dealer_identity_id?: string | null;
  membership_status?: "active" | "withdrawn" | "suspended" | null;
  withdrawn_at?: string | null;
};

export type { MileageRollbackStatus };

export type ListingStatus = "active" | "negotiating" | "sold" | "removed" | "draft";

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
  inspection_badge_type: InspectionBadgeType;
  grade_total: number | null;
  grade_engine: number | null;
  grade_front: number | null;
  grade_exterior: number | null;
  grade_rear: number | null;
  grade_electrical: number | null;
  grade_frame: number | null;
  inspection_remaining: string | null;
  inspection_expiry_date?: string | null;
  liability_insurance_expiry_date?: string | null;
  model_designation?: string | null;
  engine_model?: string | null;
  is_officially_stamped_vin?: boolean;
  vin_note?: string | null;
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
  seller_intent_confirmed: boolean;
  buyer_intent_confirmed: boolean;
  payment_due_at: string | null;
  platform_fee_invoice_issued_at?: string | null;
  platform_fee_due_at?: string | null;
  platform_fee_paid_at?: string | null;
  platform_fee_accrued_at?: string | null;
  seller_payment_confirmed_at: string | null;
  buyer_payment_reported_at: string | null;
  pickup_scheduled_at: string | null;
  pickup_completed_at: string | null;
  /** @deprecated 書類は車両と同時引渡。UIでは未使用 */
  documents_shipped_at?: string | null;
  transfer_completed_at: string | null;
  tracking_number: string | null;
  created_at: string;
  updated_at: string;
};

export type TransactionPartySnapshot = {
  store_name?: string | null;
  trade_name?: string | null;
  contact_name?: string | null;
  antique_dealer_number?: string | null;
  invoice_number?: string | null;
  prefecture?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type TransactionRecord = {
  id: string;
  deal_id: string;
  vehicle_id: string;
  seller_id: string;
  buyer_id: string;
  contracted_at: string;
  vehicle_name: string;
  manufacturer: string;
  displacement: number | null;
  model_year: number | null;
  mileage: number | null;
  vin: string;
  registration_number: string;
  sale_price_ex_tax: number;
  sale_price_inc_tax: number;
  platform_fee_ex_tax: number;
  platform_fee_inc_tax: number;
  seller_snapshot_json: TransactionPartySnapshot;
  buyer_snapshot_json: TransactionPartySnapshot;
  vehicle_snapshot_json: Record<string, unknown>;
  handover_due_at: string | null;
  handover_completed_at: string | null;
  documents_status: string;
  payment_status: string;
  notes: string;
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

export type DisputeType =
  | "vehicle_defect"
  | "document_issue"
  | "payment_issue"
  | "cancellation_request"
  | "suspected_fraud";

export type DefectSeverity = "minor" | "major" | "critical";

export type DisputeRequestedOutcome = "continue" | "discount" | "cancel" | "consult";

export type DisputeFeeHandling = "charge" | "waive" | "partial" | "pending";

export type DisputeEvidence = {
  id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
};

export type Dispute = {
  id: string;
  deal_id: string;
  reporter_id: string;
  target_user_id: string;
  category: DisputeCategory;
  dispute_type?: DisputeType | null;
  defect_severity?: DefectSeverity | null;
  requested_outcome?: DisputeRequestedOutcome | null;
  cancellation_reason?: string | null;
  admin_decision?: string | null;
  seller_penalty_points?: number | null;
  buyer_penalty_points?: number | null;
  fee_handling?: DisputeFeeHandling | null;
  fraud_suspected?: boolean;
  admin_notes?: string | null;
  evidence?: DisputeEvidence[];
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

export type SupportTicketCategory =
  | "name_transfer"
  | "documents"
  | "payment"
  | "deal"
  | "billing"
  | "system"
  | "other";

export type SupportTicketStatus = "open" | "reviewing" | "answered" | "closed";

export type SupportTicket = {
  id: string;
  user_id: string;
  deal_id: string | null;
  category: SupportTicketCategory;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  admin_reply: string | null;
  created_at: string;
  updated_at: string;
  answered_at: string | null;
};

export type MessageImportance = "normal" | "important" | "urgent";

export type UserNotification = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  importance: MessageImportance;
  link_url: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

export type MonthlyPaymentStatus =
  | "reported"
  | "unconfirmed"
  | "confirmed"
  | "rejected";

export type MonthlyPaymentReport = {
  id: string;
  user_id: string;
  billing_month: string;
  reported_amount: number;
  paid_at: string;
  payer_name: string;
  note: string | null;
  status: MonthlyPaymentStatus;
  admin_note: string | null;
  created_at: string;
};

export type InvoiceParty = "buyer" | "seller";
export type InvoiceStatus = "draft" | "review_pending" | "issued" | "paid" | "cancelled";

export type InvoiceDocumentKind =
  | "legacy"
  | "payment_instruction"
  | "platform_fee"
  | "motohub_inspection"
  | "monthly_membership"
  | "part_payment_instruction"
  | "part_platform_fee"
  | "weekly_vehicle_platform_fee"
  | "weekly_part_platform_fee";

export type Invoice = {
  id: string;
  deal_id: string | null;
  inspection_request_id?: string | null;
  part_sale_id?: string | null;
  billing_month?: string | null;
  billing_week_start?: string | null;
  billing_week_end?: string | null;
  invoice_number?: string | null;
  billing_trust_rank?: TrustRank | null;
  user_id: string;
  party: InvoiceParty;
  document_kind?: InvoiceDocumentKind;
  status: InvoiceStatus;
  total_ex_tax: number;
  total_tax: number;
  total_inc_tax: number;
  issued_at: string | null;
  payment_due_at?: string | null;
  paid_at: string | null;
};

export type PartFulfillmentMode = "shipping" | "direct";

export type PartSale = {
  id: string;
  part_listing_id: string;
  buyer_id: string;
  seller_id: string;
  agreed_price_ex_tax: number;
  seller_fee_ex_tax: number;
  shipping_bearer: "buyer" | "seller" | "consult";
  shipped_at: string | null;
  handover_at: string | null;
  buyer_payment_confirmed_at: string | null;
  fee_accrued_at: string | null;
  fulfillment_mode: PartFulfillmentMode | null;
  completed_at: string;
};

export type PayoutStatus = "awaiting" | "ready" | "paid" | "cancelled";

export type Payout = {
  id: string;
  deal_id: string;
  seller_id: string;
  gross_vehicle_price: number;
  seller_fee_ex_tax: number;
  seller_fee_tax: number;
  payout_amount: number;
  status: PayoutStatus;
  paid_at: string | null;
};

export type MemberStats = {
  completed_deals: number;
  total_listings: number;
  inspected_listings: number;
};
