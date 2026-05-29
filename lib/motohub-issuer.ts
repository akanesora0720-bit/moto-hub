import { formatBankAccount } from "@/lib/billing";
import type { SupabaseClient } from "@supabase/supabase-js";

export type MotohubIssuer = {
  companyName: string;
  address: string | null;
  phone: string | null;
  qualifiedInvoiceNumber: string;
  bankLine: string | null;
};

const DEFAULT_COMPANY = "株式会社RideWorks";

function issuerFromEnv(): MotohubIssuer {
  const bankProfile = {
    bank_name: process.env.MOTOHUB_BANK_NAME?.trim() ?? null,
    bank_branch: process.env.MOTOHUB_BANK_BRANCH?.trim() ?? null,
    bank_account_type: process.env.MOTOHUB_BANK_ACCOUNT_TYPE?.trim() ?? "普通",
    bank_account_number: process.env.MOTOHUB_BANK_ACCOUNT_NUMBER?.trim() ?? null,
    bank_account_holder: process.env.MOTOHUB_BANK_ACCOUNT_HOLDER?.trim() ?? null,
  };

  return {
    companyName: process.env.MOTOHUB_ISSUER_NAME?.trim() || DEFAULT_COMPANY,
    address: process.env.MOTOHUB_ISSUER_ADDRESS?.trim() || null,
    phone: process.env.MOTOHUB_ISSUER_PHONE?.trim() || null,
    qualifiedInvoiceNumber:
      process.env.MOTOHUB_QUALIFIED_INVOICE_NUMBER?.trim() || "T0000000000000",
    bankLine: formatBankAccount(bankProfile),
  };
}

/** 手数料請求書の発行元（Moto-Hub運営）。環境変数優先、未設定時は運営メールの profiles 口座 */
export async function getMotohubIssuer(
  supabase?: SupabaseClient,
): Promise<MotohubIssuer> {
  const base = issuerFromEnv();
  if (base.bankLine || !supabase) {
    return base;
  }

  const email = process.env.MOTOHUB_OPERATOR_EMAIL?.trim() ?? "info@moto-hub.jp";
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "store_name, address, phone, invoice_number, bank_name, bank_branch, bank_account_type, bank_account_number, bank_account_holder",
    )
    .eq("email", email)
    .maybeSingle();

  if (!profile) {
    return base;
  }

  const bankLine = formatBankAccount(profile);
  return {
    companyName: process.env.MOTOHUB_ISSUER_NAME?.trim() || profile.store_name || DEFAULT_COMPANY,
    address: base.address ?? profile.address ?? null,
    phone: base.phone ?? profile.phone ?? null,
    qualifiedInvoiceNumber:
      base.qualifiedInvoiceNumber !== "T0000000000000"
        ? base.qualifiedInvoiceNumber
        : profile.invoice_number?.trim() || base.qualifiedInvoiceNumber,
    bankLine: bankLine ?? base.bankLine,
  };
}
