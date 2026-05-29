import { isDealerApproved } from "@/lib/account-status";
import type { MemberType, Profile, VerificationStatus } from "@/lib/types";

export type DealerProfileInput = {
  store_name: string;
  trade_name: string;
  contact_name: string;
  antique_dealer_number: string;
  invoice_number: string;
  prefecture: string;
  address: string;
  phone: string;
  bank_name: string;
  bank_branch: string;
  bank_account_type: string;
  bank_account_number: string;
  bank_account_holder: string;
};

export type StaffProfileInput = {
  contact_name: string;
  phone: string;
};

export function isProfileComplete(profile: Profile | null): boolean {
  if (!profile) return false;
  if (!profile.profile_completed || !profile.is_active) return false;

  if (profile.member_type === "staff") {
    return !!profile.contact_name && !!profile.phone;
  }

  return (
    !!profile.store_name &&
    !!profile.trade_name &&
    !!profile.contact_name &&
    !!profile.antique_dealer_number &&
    !!profile.antique_dealer_doc_path &&
    !!profile.invoice_number &&
    !!profile.invoice_doc_path &&
    !!profile.prefecture &&
    !!profile.address &&
    !!profile.phone &&
    !!profile.bank_name &&
    !!profile.bank_account_number &&
    !!profile.bank_account_holder
  );
}

export function canAccessAdmin(profile: Profile | null): boolean {
  if (!profile?.is_active) return false;
  return profile.is_admin || profile.member_type === "staff";
}

/** 査定依頼の対応・出品代行（staff または is_admin の業者管理者） */
export function canPerformMotohubInspection(profile: Profile | null): boolean {
  if (!profile?.is_active) return false;
  return profile.member_type === "staff" || profile.is_admin;
}

/** 出品・商談など加盟店の本番機能（加盟審査承認後） */
export function canUseDealerTradingFeatures(profile: Profile | null): boolean {
  if (!profile?.is_active || profile.is_banned) return false;
  if (profile.member_type === "staff" || profile.is_admin) return true;
  return isProfileComplete(profile) && isDealerApproved(profile);
}

export function buildDealerProfilePayload(
  input: DealerProfileInput,
  docs: {
    antique_dealer_doc_path: string;
    invoice_doc_path: string;
    submitForReview: boolean;
  },
) {
  const base = {
    store_name: input.store_name.trim(),
    trade_name: input.trade_name.trim(),
    contact_name: input.contact_name.trim(),
    antique_dealer_number: input.antique_dealer_number.trim(),
    invoice_number: input.invoice_number.trim(),
    prefecture: input.prefecture,
    address: input.address.trim(),
    phone: input.phone.trim(),
    bank_name: input.bank_name.trim(),
    bank_branch: input.bank_branch.trim(),
    bank_account_type: input.bank_account_type.trim() || "普通",
    bank_account_number: input.bank_account_number.trim(),
    bank_account_holder: input.bank_account_holder.trim(),
    antique_dealer_doc_path: docs.antique_dealer_doc_path,
    invoice_doc_path: docs.invoice_doc_path,
    profile_completed: true,
  };

  if (docs.submitForReview) {
    return {
      ...base,
      verification_status: "pending" as VerificationStatus,
    };
  }

  return base;
}

export function buildStaffProfilePayload(input: StaffProfileInput) {
  return {
    store_name: "Moto-Hub運営",
    contact_name: input.contact_name.trim(),
    phone: input.phone.trim(),
    profile_completed: true,
    verification_status: "verified" as VerificationStatus,
  };
}
