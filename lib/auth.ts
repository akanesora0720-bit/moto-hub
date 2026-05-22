import type { MemberType, Profile, VerificationStatus } from "@/lib/types";

export type DealerProfileInput = {
  store_name: string;
  contact_name: string;
  antique_dealer_number: string;
  invoice_number: string;
  prefecture: string;
  phone: string;
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
    !!profile.contact_name &&
    !!profile.antique_dealer_number &&
    !!profile.antique_dealer_doc_path &&
    !!profile.invoice_number &&
    !!profile.invoice_doc_path &&
    !!profile.prefecture &&
    !!profile.phone
  );
}

export function canAccessAdmin(profile: Profile | null): boolean {
  if (!profile?.is_active) return false;
  return profile.is_admin || profile.member_type === "staff";
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
    contact_name: input.contact_name.trim(),
    antique_dealer_number: input.antique_dealer_number.trim(),
    invoice_number: input.invoice_number.trim(),
    prefecture: input.prefecture,
    phone: input.phone.trim(),
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
    store_name: "MotoHub運営",
    contact_name: input.contact_name.trim(),
    phone: input.phone.trim(),
    profile_completed: true,
    verification_status: "verified" as VerificationStatus,
  };
}
