"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { VerificationBadge } from "@/components/VerificationBadge";
import {
  buildDealerProfilePayload,
  buildStaffProfilePayload,
  type DealerProfileInput,
  type StaffProfileInput,
} from "@/lib/auth";
import { PrefectureSelect } from "@/components/PrefectureSelect";
import { VERIFICATION_STATUS_LABELS } from "@/lib/constants";
import { isValidPrefecture, PREFECTURE_PLACEHOLDER } from "@/lib/prefectures";
import { createClient } from "@/lib/supabase/client";
import type { MemberType, VerificationStatus } from "@/lib/types";

const emptyDealer: DealerProfileInput = {
  store_name: "",
  trade_name: "",
  contact_name: "",
  antique_dealer_number: "",
  invoice_number: "",
  prefecture: PREFECTURE_PLACEHOLDER,
  address: "",
  phone: "",
  bank_name: "",
  bank_branch: "",
  bank_account_type: "普通",
  bank_account_number: "",
  bank_account_holder: "",
};

const emptyStaff: StaffProfileInput = {
  contact_name: "",
  phone: "",
};

async function uploadDoc(
  userId: string,
  kind: "antique" | "invoice",
  file: File,
): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${userId}/${kind}.${ext}`;
  const { error } = await supabase.storage
    .from("member-docs")
    .upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [memberType, setMemberType] = useState<MemberType>("dealer");
  const [dealerForm, setDealerForm] = useState(emptyDealer);
  const [staffForm, setStaffForm] = useState(emptyStaff);
  const [antiqueFile, setAntiqueFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [existingAntiquePath, setExistingAntiquePath] = useState<string | null>(null);
  const [existingInvoicePath, setExistingInvoicePath] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] =
    useState<VerificationStatus>("unverified");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();
      if (profile) {
        setMemberType(profile.member_type ?? "dealer");
        setVerificationStatus(profile.verification_status ?? "unverified");
        setExistingAntiquePath(profile.antique_dealer_doc_path);
        setExistingInvoicePath(profile.invoice_doc_path);
        setDealerForm({
          store_name: profile.store_name ?? "",
          trade_name: profile.trade_name ?? "",
          contact_name: profile.contact_name ?? "",
          antique_dealer_number: profile.antique_dealer_number ?? "",
          invoice_number: profile.invoice_number ?? "",
          prefecture: profile.prefecture ?? PREFECTURE_PLACEHOLDER,
          address: profile.address ?? "",
          phone: profile.phone ?? "",
          bank_name: profile.bank_name ?? "",
          bank_branch: profile.bank_branch ?? "",
          bank_account_type: profile.bank_account_type ?? "普通",
          bank_account_number: profile.bank_account_number ?? "",
          bank_account_holder: profile.bank_account_holder ?? "",
        });
        setStaffForm({
          contact_name: profile.contact_name ?? "",
          phone: profile.phone ?? "",
        });
      }
    });
  }, []);

  const submitStaff = async () => {
    if (!staffForm.contact_name.trim() || !staffForm.phone.trim()) {
      setMessage("担当者名と電話番号を入力してください。");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setLoading(false);
      setMessage("ログインが必要です。");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update(buildStaffProfilePayload(staffForm))
      .eq("id", userData.user.id);
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    router.replace("/admin");
    router.refresh();
  };

  const submitDealer = async () => {
    if (
      !dealerForm.store_name.trim() ||
      !dealerForm.trade_name.trim() ||
      !dealerForm.contact_name.trim() ||
      !dealerForm.antique_dealer_number.trim() ||
      !dealerForm.invoice_number.trim() ||
      !dealerForm.address.trim() ||
      !dealerForm.phone.trim() ||
      !dealerForm.bank_name.trim() ||
      !dealerForm.bank_account_number.trim() ||
      !dealerForm.bank_account_holder.trim() ||
      !isValidPrefecture(dealerForm.prefecture)
    ) {
      setMessage("必須項目（都道府県・会社情報・振込口座含む）を入力してください。");
      return;
    }
    if (!antiqueFile && !existingAntiquePath) {
      setMessage("古物商許可証の画像を1枚アップロードしてください。");
      return;
    }
    if (!invoiceFile && !existingInvoicePath) {
      setMessage("インボイス登録票の画像を1枚アップロードしてください。");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setLoading(false);
      setMessage("ログインが必要です。");
      return;
    }

    try {
      let antiquePath = existingAntiquePath;
      let invoicePath = existingInvoicePath;
      if (antiqueFile) antiquePath = await uploadDoc(userData.user.id, "antique", antiqueFile);
      if (invoiceFile) invoicePath = await uploadDoc(userData.user.id, "invoice", invoiceFile);

      const { error } = await supabase
        .from("profiles")
        .update(
          buildDealerProfilePayload(dealerForm, {
            antique_dealer_doc_path: antiquePath!,
            invoice_doc_path: invoicePath!,
            submitForReview: !!antiqueFile,
          }),
        )
        .eq("id", userData.user.id);

      setLoading(false);
      if (error) {
        setMessage(error.message);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch (e) {
      setLoading(false);
      setMessage(e instanceof Error ? e.message : "アップロードに失敗しました。");
    }
  };

  const dealerField = (key: keyof DealerProfileInput, label: string, required = false) => (
    <label className="block text-sm" key={key}>
      <span className="text-muted">
        {label}
        {required ? <span className="text-accent"> *</span> : null}
      </span>
      <input
        value={dealerForm[key]}
        onChange={(e) => setDealerForm((f) => ({ ...f, [key]: e.target.value }))}
        className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-accent"
      />
    </label>
  );

  if (memberType === "staff") {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg space-y-6">
          <div>
            <h1 className="text-2xl font-semibold">運営スタッフ登録</h1>
            <p className="mt-1 text-sm text-muted">
              古物商・インボイスは不要です。管理画面の操作に必要な情報のみ登録します。
            </p>
          </div>
          <div className="space-y-4 rounded-xl border border-border bg-card p-5">
            <label className="block text-sm">
              <span className="text-muted">担当者名 *</span>
              <input
                value={staffForm.contact_name}
                onChange={(e) => setStaffForm((f) => ({ ...f, contact_name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted">電話番号 *</span>
              <input
                value={staffForm.phone}
                onChange={(e) => setStaffForm((f) => ({ ...f, phone: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm"
              />
            </label>
          </div>
          {message ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
              {message}
            </p>
          ) : null}
          <button
            type="button"
            onClick={submitStaff}
            disabled={loading}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
          >
            {loading ? "保存中…" : "保存して管理画面へ"}
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">店舗情報</h1>
          <p className="mt-1 text-sm text-muted">
            インボイス登録事業者として、古物商・振込口座を登録してください。
          </p>
          <div className="mt-3">
            <VerificationBadge status={verificationStatus} />
            <span className="ml-2 text-xs text-muted">
              {VERIFICATION_STATUS_LABELS[verificationStatus]}
            </span>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          {dealerField("store_name", "会社名（店舗名）", true)}
          {dealerField("trade_name", "屋号", true)}
          {dealerField("contact_name", "担当者名", true)}
          {dealerField("antique_dealer_number", "古物商番号", true)}
          <label className="block text-sm">
            <span className="text-muted">
              古物商許可証の画像 <span className="text-accent">*</span>
            </span>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setAntiqueFile(e.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-medium file:text-black"
            />
          </label>
          {dealerField("invoice_number", "インボイス登録番号", true)}
          <label className="block text-sm">
            <span className="text-muted">
              インボイス登録票の画像 <span className="text-accent">*</span>
            </span>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">
              都道府県 <span className="text-accent">*</span>
            </span>
            <PrefectureSelect
              value={dealerForm.prefecture}
              onChange={(prefecture) => setDealerForm((f) => ({ ...f, prefecture }))}
              required
            />
            <p className="mt-1 text-xs text-muted">北海道から沖縄まで47都道府県から選択できます。</p>
          </label>
          {dealerField("address", "住所", true)}
          {dealerField("phone", "電話番号", true)}
          <p className="text-xs font-medium text-muted">振込先口座（買い手への入金指示に使用）</p>
          {dealerField("bank_name", "金融機関名", true)}
          {dealerField("bank_branch", "支店名", true)}
          {dealerField("bank_account_type", "口座種別（普通/当座）", true)}
          {dealerField("bank_account_number", "口座番号", true)}
          {dealerField("bank_account_holder", "口座名義", true)}
        </div>

        {message ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">{message}</p>
        ) : null}

        <button
          type="button"
          onClick={submitDealer}
          disabled={loading}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
        >
          {loading ? "保存中…" : "保存して在庫一覧へ"}
        </button>
      </div>
    </AppShell>
  );
}
