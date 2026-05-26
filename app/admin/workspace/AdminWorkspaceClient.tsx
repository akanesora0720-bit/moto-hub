"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AdminDealFinalizePanel } from "@/components/AdminDealFinalizePanel";
import { AdminEmergencyContactLog } from "@/components/AdminEmergencyContactLog";
import { TrustBadge } from "@/components/TrustBadge";
import { VerificationBadge } from "@/components/VerificationBadge";
import { formatYen } from "@/lib/format";
import { VERIFICATION_STATUS_LABELS } from "@/lib/constants";
import { resolveDealFeeRates } from "@/lib/billing";
import { pickPrimaryDealForInquiry } from "@/lib/admin-inquiry-deal";
import {
  DEAL_STATUSES,
  ADMIN_DEAL_STATUS_LABELS,
  formatPickupSchedule,
  formatTransferDeadline,
} from "@/lib/deal-flow";
import { COMPLAINT_TYPES } from "@/lib/trust";
import type { ComplaintType, DealStatus, TrustRank, VerificationStatus } from "@/lib/types";
import { normalizeVideoUrl } from "@/lib/video-url";
import { filterActionableDealAlerts } from "@/lib/deal-alerts";
import { MemberMembershipReviewBanner } from "@/components/MemberMembershipReviewBanner";
import { createClient } from "@/lib/supabase/client";

type Tab = "inquiries" | "listings" | "members" | "complaints" | "deals";

type InquiryRow = {
  id: string;
  buyer_id: string;
  message: string;
  status: "open" | "closed";
  created_at: string;
  listing: { id: string; maker: string; model: string; price_ex_tax: number } | null;
  buyer: { store_name: string | null; email: string | null } | null;
  deal_id: string | null;
  deal_status: DealStatus | null;
  linked_deal_count: number;
};

type ComplaintRow = {
  id: string;
  complaint_type: ComplaintType;
  description: string;
  penalty_score: number;
  status: string;
  created_at: string;
  listing: { maker: string; model: string } | null;
  buyer: { store_name: string | null } | null;
  seller: { store_name: string | null; trust_score: number; trust_rank: TrustRank } | null;
};

const TAB_KEYS: Tab[] = ["inquiries", "listings", "members", "complaints", "deals"];

export function AdminWorkspaceClient() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("inquiries");

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && TAB_KEYS.includes(t as Tab)) {
      setTab(t as Tab);
    }
  }, [searchParams]);
  const [listings, setListings] = useState<
    {
      id: string;
      maker: string;
      model: string;
      price_ex_tax: number;
      status: string;
      inspection_badge_type: string;
      engine_video_url: string | null;
      store_name: string | null;
    }[]
  >([]);
  const [videoDrafts, setVideoDrafts] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<
    {
      id: string;
      email: string;
      store_name: string | null;
      antique_dealer_number: string | null;
      member_type: "dealer" | "staff";
      is_active: boolean;
      trust_score: number;
      trust_rank: TrustRank;
      verification_status: VerificationStatus;
      antique_dealer_doc_path: string | null;
    }[]
  >([]);
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [complaints, setComplaints] = useState<ComplaintRow[]>([]);
  const [deals, setDeals] = useState<
    {
      id: string;
      status: DealStatus;
      agreed_price_ex_tax: number;
      transfer_overdue: boolean;
      transfer_deadline_at: string | null;
      funded_at: string | null;
      seller_payment_confirmed_at: string | null;
      buyer_payment_reported_at: string | null;
      pickup_scheduled_at: string | null;
      buyer_confirmed_at: string | null;
      seller_confirmed_at: string | null;
      seller_intent_confirmed: boolean;
      buyer_intent_confirmed: boolean;
      listing: { maker: string; model: string } | null;
      buyer: { store_name: string | null } | null;
      seller: { store_name: string | null } | null;
    }[]
  >([]);
  const [pending, setPending] = useState({
    openInquiries: 0,
    openSupport: 0,
    openDisputes: 0,
    paymentReportsPending: 0,
    invoicesReviewPending: 0,
    payoutsAwaiting: 0,
    transferOverdue: 0,
    pickupSchedulePending: 0,
    dealsClosurePending: 0,
    buyerPaymentReportedPending: 0,
    handoverPhasePending: 0,
    unresolvedDealAlerts: 0,
    adminNegotiationPending: 0,
  });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [dealAlerts, setDealAlerts] = useState<
    { id: string; message: string; alert_type: string; deal_id: string }[]
  >([]);
  const [message, setMessage] = useState("");
  const [staffInviteEmail, setStaffInviteEmail] = useState("");
  const [staffInviteLink, setStaffInviteLink] = useState("");
  const [hideCancelledDeals, setHideCancelledDeals] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [
      inq,
      l,
      m,
      c,
      d,
      a,
      pcInq,
      pcSup,
      pcDisp,
      pcPay,
      pcInv,
      pcPo,
      pcTr,
      pcPickup,
      pcPayoutReady,
      pcPayoutDone,
      pcBuyerPaymentReported,
      pcNegotiation,
      pcHandover,
    ] = await Promise.all([
      supabase
        .from("inquiries")
        .select(
          `
          id, buyer_id, message, status, created_at,
          listings ( id, maker, model, price_ex_tax ),
          buyer:profiles!inquiries_buyer_id_fkey ( store_name, email ),
          deals ( id, status, created_at )
        `,
        )
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("listings")
        .select(
          "id, maker, model, price_ex_tax, status, inspection_badge_type, engine_video_url, profiles!listings_seller_id_fkey ( store_name )",
        )
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("profiles")
        .select(
          "id, email, store_name, member_type, antique_dealer_number, is_active, trust_score, trust_rank, verification_status, antique_dealer_doc_path",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("complaints")
        .select(
          `
          id, complaint_type, description, penalty_score, status, created_at,
          listings ( maker, model ),
          buyer:profiles!complaints_buyer_id_fkey ( store_name ),
          seller:profiles!complaints_seller_id_fkey ( store_name, trust_score, trust_rank )
        `,
        )
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("deals")
        .select(
          `
          id, status, agreed_price_ex_tax, transfer_overdue, transfer_deadline_at,
          funded_at, seller_payment_confirmed_at, buyer_payment_reported_at, pickup_scheduled_at,
          buyer_confirmed_at, seller_confirmed_at, seller_intent_confirmed, buyer_intent_confirmed,
          listings ( maker, model ),
          buyer:profiles!deals_buyer_id_fkey ( store_name ),
          seller:profiles!deals_seller_id_fkey ( store_name )
        `,
        )
        .order("updated_at", { ascending: false }),
      supabase
        .from("deal_alerts")
        .select("id, deal_id, alert_type, message")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("support_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "reviewing"]),
      supabase.from("disputes").select("id", { count: "exact", head: true }).in("status", ["open", "reviewing"]),
      supabase.from("monthly_payment_reports").select("id", { count: "exact", head: true }).in("status", ["reported", "unconfirmed"]),
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "review_pending"),
      supabase.from("payouts").select("id", { count: "exact", head: true }).in("status", ["awaiting", "ready"]),
      supabase.from("deals").select("id", { count: "exact", head: true }).eq("transfer_overdue", true).neq("status", "completed"),
      supabase.from("deals").select("id", { count: "exact", head: true }).eq("status", "funded").is("pickup_scheduled_at", null),
      supabase.from("deals").select("id", { count: "exact", head: true }).eq("status", "payout_ready"),
      supabase.from("deals").select("id", { count: "exact", head: true }).eq("status", "payout_done"),
      supabase
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("status", "awaiting_payment")
        .not("buyer_payment_reported_at", "is", null),
      supabase
        .from("deals")
        .select("id", { count: "exact", head: true })
        .in("status", ["inquiry", "negotiating"]),
      supabase
        .from("deals")
        .select("id", { count: "exact", head: true })
        .in("status", ["handover_done", "transfer_pending"]),
    ]);
    setInquiries(
      (inq.data ?? []).map((row) => {
        const listing = Array.isArray(row.listings) ? row.listings[0] : row.listings;
        const buyer = Array.isArray(row.buyer) ? row.buyer[0] : row.buyer;
        const dealRows = (Array.isArray(row.deals) ? row.deals : row.deals ? [row.deals] : []) as {
          id: string;
          status: DealStatus;
          created_at: string;
        }[];
        const primary = pickPrimaryDealForInquiry(dealRows);
        return {
          id: row.id,
          buyer_id: row.buyer_id,
          message: row.message,
          status: row.status as InquiryRow["status"],
          created_at: row.created_at,
          listing: listing as InquiryRow["listing"],
          buyer: buyer as InquiryRow["buyer"],
          deal_id: primary?.id ?? null,
          deal_status: primary?.status ?? null,
          linked_deal_count: dealRows.length,
        };
      }),
    );
    const listingRows = (l.data ?? []).map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: row.id,
        maker: row.maker,
        model: row.model,
        price_ex_tax: row.price_ex_tax,
        status: row.status,
        inspection_badge_type: row.inspection_badge_type ?? "none",
        engine_video_url: row.engine_video_url ?? null,
        store_name: (profile as { store_name: string | null } | null)?.store_name ?? null,
      };
    });
    setListings(listingRows);
    setVideoDrafts(
      Object.fromEntries(
        listingRows.map((r) => [r.id, r.engine_video_url ?? ""]),
      ),
    );
    setMembers((m.data ?? []) as typeof members);
    setComplaints(
      (c.data ?? []).map((row) => {
        const listing = Array.isArray(row.listings) ? row.listings[0] : row.listings;
        const buyer = Array.isArray(row.buyer) ? row.buyer[0] : row.buyer;
        const seller = Array.isArray(row.seller) ? row.seller[0] : row.seller;
        return {
          id: row.id,
          complaint_type: row.complaint_type as ComplaintType,
          description: row.description,
          penalty_score: row.penalty_score,
          status: row.status,
          created_at: row.created_at,
          listing: listing as ComplaintRow["listing"],
          buyer: buyer as ComplaintRow["buyer"],
          seller: seller as ComplaintRow["seller"],
        };
      }),
    );
    const dealRows = (d.data ?? []).map((row) => {
        const listing = Array.isArray(row.listings) ? row.listings[0] : row.listings;
        const buyer = Array.isArray(row.buyer) ? row.buyer[0] : row.buyer;
        const seller = Array.isArray(row.seller) ? row.seller[0] : row.seller;
        return {
          id: row.id,
          status: row.status as DealStatus,
          agreed_price_ex_tax: row.agreed_price_ex_tax,
          transfer_overdue: row.transfer_overdue ?? false,
          transfer_deadline_at: row.transfer_deadline_at ?? null,
          funded_at: row.funded_at ?? null,
          seller_payment_confirmed_at: row.seller_payment_confirmed_at ?? null,
          buyer_payment_reported_at: row.buyer_payment_reported_at ?? null,
          pickup_scheduled_at: row.pickup_scheduled_at ?? null,
          buyer_confirmed_at: row.buyer_confirmed_at ?? null,
          seller_confirmed_at: row.seller_confirmed_at ?? null,
          seller_intent_confirmed: row.seller_intent_confirmed ?? false,
          buyer_intent_confirmed: row.buyer_intent_confirmed ?? false,
          listing: listing as { maker: string; model: string } | null,
          buyer: buyer as { store_name: string | null } | null,
          seller: seller as { store_name: string | null } | null,
        };
      });
    setDeals(dealRows);
    const alertRows = (a.data ?? []) as typeof dealAlerts;
    setDealAlerts(alertRows);
    const actionableAlerts = filterActionableDealAlerts(alertRows, dealRows);
    setPending({
      openInquiries: pcInq.count ?? 0,
      openSupport: pcSup.count ?? 0,
      openDisputes: pcDisp.count ?? 0,
      paymentReportsPending: pcPay.count ?? 0,
      invoicesReviewPending: pcInv.count ?? 0,
      payoutsAwaiting: pcPo.count ?? 0,
      transferOverdue: pcTr.count ?? 0,
      pickupSchedulePending: pcPickup.count ?? 0,
      dealsClosurePending: (pcPayoutReady.count ?? 0) + (pcPayoutDone.count ?? 0),
      buyerPaymentReportedPending: pcBuyerPaymentReported.count ?? 0,
      handoverPhasePending: pcHandover.count ?? 0,
      unresolvedDealAlerts: actionableAlerts.length,
      adminNegotiationPending: pcNegotiation.count ?? 0,
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const actionableDealAlerts = useMemo(
    () => filterActionableDealAlerts(dealAlerts, deals),
    [dealAlerts, deals],
  );

  const removeListing = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_remove_listing", {
      p_listing_id: id,
    });
    setMessage(error ? error.message : "出品を削除（非表示）にしました。");
    load();
  };

  const saveEngineVideo = async (id: string) => {
    const raw = videoDrafts[id] ?? "";
    const normalized = normalizeVideoUrl(raw);
    if (raw.trim() && !normalized) {
      setMessage("動画URLの形式が正しくありません。");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("listings")
      .update({ engine_video_url: normalized })
      .eq("id", id);
    setMessage(
      error
        ? error.message
        : normalized
          ? "エンジン動画URLを保存しました。"
          : "エンジン動画URLを削除しました。",
    );
    load();
  };

  const setVerification = async (id: string, status: VerificationStatus) => {
    const supabase = createClient();
    const member = members.find((m) => m.id === id);
    const { error } =
      member?.member_type === "dealer"
        ? await supabase.rpc("admin_verify_dealer", {
            p_profile_id: id,
            p_status: status,
          })
        : await supabase.from("profiles").update({
            verification_status: status,
            verified_at: status === "verified" ? new Date().toISOString() : null,
          }).eq("id", id);
    setMessage(
      error ? error.message : `古物商照合: ${VERIFICATION_STATUS_LABELS[status]} に更新しました。`,
    );
    load();
  };

  const viewDoc = async (path: string) => {
    const supabase = createClient();
    const { data, error } = await supabase.storage.from("member-docs").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      setMessage(error?.message ?? "書類を開けませんでした。");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const createStaffInvite = async () => {
    const email = staffInviteEmail.trim().toLowerCase();
    if (!email) {
      setMessage("スタッフ招待のメールアドレスを入力してください。");
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_create_staff_invite", {
      p_email: email,
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    const r = data as { token?: string; email?: string; expires_at?: string };
    if (!r?.token) {
      setMessage("招待の作成に失敗しました。");
      return;
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/signup/staff?token=${r.token}`;
    setStaffInviteLink(link);
    setMessage(
      `スタッフ招待を作成しました（${r.email}・7日間有効）。リンクをコピーして本人にのみ送付してください。`,
    );
  };

  const setMemberType = async (id: string, type: "dealer" | "staff") => {
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ member_type: type }).eq("id", id);
    setMessage(error ? error.message : `会員種別を ${type === "staff" ? "運営スタッフ" : "業者"} に変更しました。`);
    load();
  };

  const toggleMember = async (id: string, active: boolean) => {
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ is_active: !active }).eq("id", id);
    setMessage(error ? error.message : active ? "会員を停止しました。" : "会員を再開しました。");
    load();
  };

  const approveComplaint = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.rpc("approve_complaint", { p_complaint_id: id });
    setMessage(error ? error.message : "クレームを承認し、減点を適用しました。");
    load();
  };

  const rejectComplaint = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.rpc("reject_complaint", { p_complaint_id: id });
    setMessage(error ? error.message : "クレームを却下しました。");
    load();
  };

  // NOTE: ワークスペース一覧ではステータスを手動変更しない（フローは詳細ページのボタンで進める）
  const advanceDeal = async (id: string, status: DealStatus) => {
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_advance_deal", {
      p_deal_id: id,
      p_status: status,
    });
    if (error) return { error: error.message };
    setMessage(`取引を「${ADMIN_DEAL_STATUS_LABELS[status]}」に更新しました。`);
    load();
    return { okMessage: "更新しました。" };
  };

  const runDealAction = async (key: string, fn: () => Promise<void>) => {
    if (actionLoading) return;
    setActionLoading(key);
    try {
      await fn();
    } finally {
      setActionLoading(null);
    }
  };

  const closeInquiry = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("inquiries")
      .update({ status: "closed" })
      .eq("id", id);
    setMessage(error ? error.message : "問い合わせをクローズしました。");
    load();
  };

  const startDealFromInquiry = async (row: InquiryRow) => {
    if (!row.listing?.id) {
      setMessage("出品情報が不足しています。");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_create_deal", {
      p_listing_id: row.listing.id,
      p_buyer_id: row.buyer_id,
      p_agreed_price_ex_tax: row.listing.price_ex_tax,
      p_inquiry_id: row.id,
      p_initial_status: "inquiry",
    });
    setMessage(error ? error.message : "取引を作成しました（ステータス: 問い合わせ）。");
    load();
  };

  const checkTransferDeadlines = async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("run_transfer_compliance_job");
    if (error) {
      setMessage(error.message);
      return;
    }
    const r = data as {
      overdue?: number;
      due_soon?: number;
      due_today?: number;
      penalty_3d?: number;
      penalty_7d?: number;
      review_14d?: number;
    };
    setMessage(
      `名変ジョブ: 超過 ${r.overdue ?? 0} / 3日前 ${r.due_soon ?? 0} / 当日 ${r.due_today ?? 0} / 減点3日 ${r.penalty_3d ?? 0} / 7日 ${r.penalty_7d ?? 0} / 要レビュー14日 ${r.review_14d ?? 0}`,
    );
    load();
  };

  const badge = (n: number) => (n > 0 ? ` (${n})` : "");

  const complaintLabel = (t: ComplaintType) =>
    COMPLAINT_TYPES.find((x) => x.value === t)?.label ?? t;

  const sellerFeeLabel = (price: number) => {
    const { sellerFeeRate, feeWaived } = resolveDealFeeRates(price);
    if (feeWaived) return "手数料0円（3万円以下）";
    return `売手5% ${formatYen(Math.round(price * sellerFeeRate))}`;
  };

  return (
    <AppShell isAdmin mode="admin">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/admin" className="text-sm text-muted hover:text-accent">
              ← 管理センター
            </Link>
            <h1 className="mt-2 text-2xl font-semibold">商談・取引ワークスペース</h1>
            <p className="mt-1 text-sm text-muted">
              問い合わせ対応 / クレーム / 成約・名変期限
            </p>
          </div>
          <Link
            href="/admin/dashboard"
            className="rounded-lg border border-border px-4 py-2 text-sm hover:border-accent/40"
          >
            KPIダッシュボード
          </Link>
          <Link
            href="/admin/support"
            className="rounded-lg border border-border px-4 py-2 text-sm hover:border-accent/40"
          >
            サポート{badge(pending.openSupport)}
          </Link>
          <Link
            href="/admin/messages"
            className="rounded-lg border border-border px-4 py-2 text-sm hover:border-accent/40"
          >
            メール送信
          </Link>
          <Link
            href="/admin/billing"
            className={`rounded-lg border px-4 py-2 text-sm hover:border-accent/40 ${
              pending.invoicesReviewPending > 0
                ? "border-amber-500/50 text-amber-100"
                : "border-border"
            }`}
          >
            請求・入金{badge(pending.invoicesReviewPending + pending.paymentReportsPending)}
          </Link>
          <Link
            href="/admin/disputes"
            className="rounded-lg border border-border px-4 py-2 text-sm hover:border-accent/40"
          >
            トラブル{badge(pending.openDisputes)}
          </Link>
          <Link
            href="/admin/credit"
            className="rounded-lg border border-accent/40 px-4 py-2 text-sm text-accent hover:bg-accent/10"
          >
            RideWorks 信用管理 →
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              {
                key: "inquiries" as const,
                label: "問い合わせ",
                count: pending.adminNegotiationPending,
                highlight: pending.adminNegotiationPending > 0,
              },
              { key: "complaints" as const, label: "クレーム", count: 0, highlight: false },
              { key: "listings" as const, label: "出品", count: 0, highlight: false },
              { key: "members" as const, label: "会員", count: 0, highlight: false },
              {
                key: "deals" as const,
                label: "取引・完了確認",
                count:
                  pending.dealsClosurePending +
                  pending.buyerPaymentReportedPending +
                  pending.handoverPhasePending +
                  pending.unresolvedDealAlerts +
                  pending.pickupSchedulePending +
                  pending.transferOverdue,
                highlight:
                  pending.dealsClosurePending > 0 ||
                  pending.buyerPaymentReportedPending > 0 ||
                  pending.handoverPhasePending > 0 ||
                  pending.unresolvedDealAlerts > 0,
              },
            ] as const
          ).map(({ key, label, count, highlight }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`min-h-11 rounded-xl px-5 py-2.5 text-sm font-medium touch-manipulation ${
                tab === key
                  ? "bg-accent text-black shadow-md"
                  : highlight
                    ? "border-2 border-amber-500/70 bg-amber-950/40 text-amber-100"
                    : "bg-zinc-900 text-muted"
              }`}
            >
              {label}
              {count > 0 ? (
                <span
                  className={`ml-2 inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 py-0.5 text-xs font-bold ${
                    tab === key ? "bg-black/20 text-black" : "bg-rose-500 text-white"
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {message ? (
          <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">{message}</p>
        ) : null}

        {tab === "inquiries" ? (
          <div className="space-y-3">
            {inquiries.length === 0 ? (
              <p className="text-sm text-muted">問い合わせはありません。</p>
            ) : (
              inquiries.map((row) => (
                <div
                  key={row.id}
                  className="rounded-xl border border-border bg-card p-4 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {row.listing
                          ? `${row.listing.maker} ${row.listing.model}`
                          : "—"}
                        <span className="ml-2 text-xs text-muted">
                          {row.status === "open" ? "未対応" : "クローズ"}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        申請: {row.buyer?.store_name ?? "—"}（{row.buyer?.email ?? "—"}）·{" "}
                        {new Date(row.created_at).toLocaleString("ja-JP")}
                      </p>
                    </div>
                    {row.listing ? (
                      <Link
                        href={`/listings/${row.listing.id}`}
                        className="text-xs text-accent hover:underline"
                      >
                        出品を見る
                      </Link>
                    ) : null}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap leading-relaxed text-zinc-300">
                    {row.message}
                  </p>
                  {row.status === "open" ? (
                    <div className="mt-3 flex flex-wrap gap-3">
                      {row.deal_id && row.deal_status ? (
                        <Link
                          href={`/admin/deals/${row.deal_id}`}
                          className={
                            row.deal_status === "cancelled"
                              ? "text-muted hover:underline"
                              : "text-emerald-300 hover:underline"
                          }
                        >
                          {ADMIN_DEAL_STATUS_LABELS[row.deal_status]}（取引を見る）
                        </Link>
                      ) : row.linked_deal_count > 0 ? (
                        <span className="text-xs text-amber-200">
                          紐づく取引 {row.linked_deal_count} 件（有効な取引がありません）
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startDealFromInquiry(row)}
                          className="text-emerald-300 hover:underline"
                        >
                          取引を作成（レガシー）
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => closeInquiry(row.id)}
                        className="text-muted hover:underline"
                      >
                        クローズ
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === "complaints" ? (
          <div className="space-y-3">
            {complaints.length === 0 ? (
              <p className="text-sm text-muted">クレームはありません。</p>
            ) : (
              complaints.map((row) => (
                <div
                  key={row.id}
                  className="rounded-xl border border-border bg-card p-4 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {row.listing
                          ? `${row.listing.maker} ${row.listing.model}`
                          : "—"}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {complaintLabel(row.complaint_type)} · -{row.penalty_score}点 ·{" "}
                        {row.status}
                      </p>
                    </div>
                    {row.seller ? (
                      <TrustBadge
                        rank={row.seller.trust_rank}
                        score={row.seller.trust_score}
                        compact
                      />
                    ) : null}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-zinc-300">{row.description}</p>
                  <p className="mt-2 text-xs text-muted">
                    申請: {row.buyer?.store_name ?? "—"} → 出品者:{" "}
                    {row.seller?.store_name ?? "—"}
                  </p>
                  {row.status === "pending" ? (
                    <div className="mt-3 flex gap-3">
                      <button
                        type="button"
                        onClick={() => approveComplaint(row.id)}
                        className="text-emerald-300 hover:underline"
                      >
                        承認して減点
                      </button>
                      <button
                        type="button"
                        onClick={() => rejectComplaint(row.id)}
                        className="text-muted hover:underline"
                      >
                        却下
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === "listings" ? (
          <div className="space-y-3">
            <p className="text-xs text-muted">
              エンジン稼働動画は外部URL（YouTube等）を任意で登録。業者から受け取ったリンクを貼って保存してください。
            </p>
            {listings.map((row) => (
              <div
                key={row.id}
                className="rounded-xl border border-border bg-card text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
                  <div>
                    <Link href={`/listings/${row.id}`} className="font-medium hover:text-accent">
                      {row.maker} {row.model}
                    </Link>
                    <span className="ml-2 text-muted">{formatYen(row.price_ex_tax)}</span>
                    <span className="ml-2 text-xs text-zinc-500">{row.store_name ?? "—"}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {row.inspection_badge_type === "motohub_inspected" ? (
                      <span className="text-sky-300">MotoHub査定済</span>
                    ) : null}
                    {row.engine_video_url ? (
                      <span className="text-sky-300">動画あり</span>
                    ) : null}
                    {row.status !== "removed" ? (
                      <button
                        type="button"
                        onClick={() => removeListing(row.id)}
                        className="text-rose-300 hover:underline"
                      >
                        削除
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-2 px-4 py-3">
                  <label className="min-w-0 flex-1 text-xs">
                    <span className="text-muted">エンジン動画URL（任意）</span>
                    <input
                      value={videoDrafts[row.id] ?? ""}
                      onChange={(e) =>
                        setVideoDrafts((d) => ({ ...d, [row.id]: e.target.value }))
                      }
                      placeholder="https://youtube.com/..."
                      className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => saveEngineVideo(row.id)}
                    className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-black"
                  >
                    保存
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {tab === "members" ? (
          <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold">運営スタッフ招待</h2>
            <p className="mt-1 text-xs text-zinc-500">
              ログイン画面にスタッフ登録は出しません。招待リンクを本人にだけ送ってください（7日間有効・1回限り）。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                type="email"
                value={staffInviteEmail}
                onChange={(e) => setStaffInviteEmail(e.target.value)}
                placeholder="staff@example.com"
                className="min-w-[220px] flex-1 rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={createStaffInvite}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black"
              >
                招待リンクを発行
              </button>
            </div>
            {staffInviteLink ? (
              <p className="mt-3 break-all rounded-lg border border-border bg-zinc-900/50 p-3 font-mono text-xs text-accent">
                {staffInviteLink}
              </p>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b border-border bg-zinc-900/80 text-muted">
                <tr>
                  <th className="px-4 py-3">店舗</th>
                  <th className="px-4 py-3">種別</th>
                  <th className="px-4 py-3">信用</th>
                  <th className="px-4 py-3">照合</th>
                  <th className="px-4 py-3">状態</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {members.map((row) => (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="px-4 py-3">
                      <Link href={`/members/${row.id}`} className="font-medium hover:text-accent">
                        {row.store_name ?? "—"}
                      </Link>
                      <div className="text-xs text-muted">{row.email}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {row.member_type === "staff" ? "運営" : "業者"}
                    </td>
                    <td className="px-4 py-3">
                      {row.member_type === "dealer" ? (
                        <TrustBadge rank={row.trust_rank} score={row.trust_score} compact />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <VerificationBadge status={row.verification_status} />
                      {row.member_type === "dealer" && row.verification_status === "pending" ? (
                        <MemberMembershipReviewBanner profileId={row.id} />
                      ) : null}
                      {row.antique_dealer_doc_path ? (
                        <button
                          type="button"
                          onClick={() => viewDoc(row.antique_dealer_doc_path!)}
                          className="mt-1 block text-xs text-accent hover:underline"
                        >
                          許可証
                        </button>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{row.is_active ? "有効" : "停止"}</td>
                    <td className="px-4 py-3 space-y-1 text-xs">
                      {row.verification_status === "pending" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setVerification(row.id, "verified")}
                            className="block text-emerald-300 hover:underline"
                          >
                            照合OK
                          </button>
                          <button
                            type="button"
                            onClick={() => setVerification(row.id, "rejected")}
                            className="block text-rose-300 hover:underline"
                          >
                            差戻し
                          </button>
                        </>
                      ) : null}
                      {row.member_type === "dealer" ? (
                        <button
                          type="button"
                          onClick={() => setMemberType(row.id, "staff")}
                          className="block text-accent hover:underline"
                        >
                          スタッフ化
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setMemberType(row.id, "dealer")}
                          className="block text-muted hover:underline"
                        >
                          業者に戻す
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleMember(row.id, row.is_active)}
                        className="block text-muted hover:underline"
                      >
                        {row.is_active ? "停止" : "再開"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        ) : null}

        {tab === "deals" ? (
          <div className="space-y-6">
            {pending.buyerPaymentReportedPending > 0 ? (
              <div className="rounded-xl border-2 border-sky-500/50 bg-sky-950/30 p-4">
                <p className="text-base font-semibold text-sky-50">
                  {pending.buyerPaymentReportedPending} 件 — 買い手が振込報告済み（売り手の入金確認待ち）
                </p>
                <p className="mt-2 text-sm text-sky-100/90">
                  車両代金は当事者間で完結します。下の一覧「入金・引取」列で振込報告日時を確認し、売り手の確認を促してください。
                </p>
              </div>
            ) : null}

            {pending.dealsClosurePending > 0 ? (
              <div className="rounded-xl border-2 border-amber-500/60 bg-amber-950/40 p-4">
                <p className="text-base font-semibold text-amber-50">
                  {pending.dealsClosurePending} 件の取引が完了登録待ちです
                </p>
                <p className="mt-2 text-sm text-amber-100/90">
                  各行の<strong className="font-medium"> 詳細 </strong>
                  を開き、「運営の手順」の
                  <strong className="font-medium">取引を完了にする</strong>
                  を押してください（精算ページと二重操作しない）。
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={checkTransferDeadlines}
                className="rounded-lg border border-amber-500/40 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/10"
              >
                名変期限をチェック
              </button>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={hideCancelledDeals}
                  onChange={(e) => setHideCancelledDeals(e.target.checked)}
                  className="rounded border-border"
                />
                取消済みを非表示
              </label>
            </div>

            {actionableDealAlerts.length > 0 ? (
              <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-sm font-medium text-amber-200">取引警告</p>
                {actionableDealAlerts.map((a) => (
                  <p key={a.id} className="text-xs text-amber-100/90">
                    {a.message}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="border-b border-border bg-zinc-900/80 text-muted">
                  <tr>
                    <th className="px-4 py-3">車両</th>
                    <th className="px-4 py-3">売り手</th>
                    <th className="px-4 py-3">買い手</th>
                    <th className="px-4 py-3">価格</th>
                    <th className="px-4 py-3">状態</th>
                    <th className="px-4 py-3">入金・引取</th>
                    <th className="px-4 py-3">完了確認</th>
                    <th className="px-4 py-3">名変</th>
                    <th className="px-4 py-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {deals
                    .filter((row) => !hideCancelledDeals || row.status !== "cancelled")
                    .map((row) => (
                    <tr
                      key={row.id}
                      className={`border-b border-border/60 align-top ${
                        row.status === "awaiting_payment" && row.buyer_payment_reported_at
                          ? "bg-sky-950/20"
                          : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        {row.listing ? `${row.listing.maker} ${row.listing.model}` : "—"}
                        <Link
                          href={`/admin/deals/${row.id}`}
                          className="mt-1 block text-xs text-accent hover:underline"
                        >
                          詳細
                        </Link>
                      </td>
                      <td className="px-4 py-3">{row.seller?.store_name ?? "—"}</td>
                      <td className="px-4 py-3">{row.buyer?.store_name ?? "—"}</td>
                      <td className="px-4 py-3">
                        {formatYen(row.agreed_price_ex_tax)}
                        <span className="block text-xs text-muted">{sellerFeeLabel(row.agreed_price_ex_tax)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded bg-zinc-800 px-2 py-0.5 text-xs">
                          {ADMIN_DEAL_STATUS_LABELS[row.status]}
                        </span>
                        <AdminDealFinalizePanel
                          dealId={row.id}
                          sellerIntent={row.seller_intent_confirmed}
                          buyerIntent={row.buyer_intent_confirmed}
                          status={row.status}
                          onUpdated={load}
                        />
                      </td>
                      <td className="px-4 py-3 text-xs">
                        振込報告{" "}
                        {row.buyer_payment_reported_at ? (
                          <span className="text-sky-300">
                            {formatPickupSchedule(row.buyer_payment_reported_at)}
                          </span>
                        ) : row.status === "awaiting_payment" ? (
                          <span className="text-muted">未</span>
                        ) : (
                          "—"
                        )}
                        <br />
                        入金確認{" "}
                        {row.seller_payment_confirmed_at || row.funded_at ? (
                          <span className="text-emerald-300">済</span>
                        ) : (
                          <span className="text-amber-200">未</span>
                        )}
                        <br />
                        引取{" "}
                        {row.pickup_scheduled_at ? (
                          <span className="text-emerald-300">
                            {formatPickupSchedule(row.pickup_scheduled_at)}
                          </span>
                        ) : row.status === "funded" ? (
                          <span className="text-amber-200">入力待ち</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        買 {row.buyer_confirmed_at ? "済" : "未"}
                        <br />
                        売 {row.seller_confirmed_at ? "済" : "未"}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {row.transfer_deadline_at
                          ? formatTransferDeadline(row.transfer_deadline_at)
                          : "—"}
                        {row.transfer_overdue ? (
                          <span className="block text-rose-300">超過・減点候補</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 space-y-1 text-xs">
                        <Link
                          href={`/admin/deals/${row.id}`}
                          className="block font-medium text-accent hover:underline"
                        >
                          詳細で処理 →
                        </Link>
                        {row.status !== "cancelled" && row.status !== "completed" ? (
                          <button
                            type="button"
                            disabled={!!actionLoading}
                            onClick={() =>
                              runDealAction(`${row.id}:cancel`, async () => {
                                if (!window.confirm("この取引を取消しますか？")) return;
                                await advanceDeal(row.id, "cancelled");
                              })
                            }
                            className="block text-muted hover:underline disabled:opacity-50"
                          >
                            {actionLoading === `${row.id}:cancel` ? "処理中…" : "取消"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">
              同一車両に取引が複数ある場合は、取消済みを除いた1件が正です。問い合わせタブのリンクは有効な取引（未完了・未取消）を優先表示します。
            </p>

            <section className="rounded-xl border border-amber-500/25 bg-amber-950/20 p-4">
              <h3 className="text-sm font-semibold text-amber-100">緊急連絡先 開示履歴</h3>
              <p className="mt-1 text-xs text-muted">
                買い手が取引連絡板から「緊急連絡先を表示」した記録です。
              </p>
              <div className="mt-4">
                <AdminEmergencyContactLog />
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
