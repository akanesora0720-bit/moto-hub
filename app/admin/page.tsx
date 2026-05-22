"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { TrustBadge } from "@/components/TrustBadge";
import { VerificationBadge } from "@/components/VerificationBadge";
import { formatYen } from "@/lib/format";
import { FEE_RATE, VERIFICATION_STATUS_LABELS } from "@/lib/constants";
import { DEAL_STATUSES, DEAL_STATUS_LABELS, formatTransferDeadline } from "@/lib/deal-flow";
import { COMPLAINT_TYPES } from "@/lib/trust";
import type { ComplaintType, DealStatus, TrustRank, VerificationStatus } from "@/lib/types";
import { normalizeVideoUrl } from "@/lib/video-url";
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

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("inquiries");
  const [listings, setListings] = useState<
    {
      id: string;
      maker: string;
      model: string;
      price_ex_tax: number;
      status: string;
      inspection_status: boolean;
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
      buyer_confirmed_at: string | null;
      seller_confirmed_at: string | null;
      listing: { maker: string; model: string } | null;
      buyer: { store_name: string | null } | null;
      seller: { store_name: string | null } | null;
    }[]
  >([]);
  const [dealAlerts, setDealAlerts] = useState<
    { id: string; message: string; alert_type: string; deal_id: string }[]
  >([]);
  const [message, setMessage] = useState("");
  const [staffInviteEmail, setStaffInviteEmail] = useState("");
  const [staffInviteLink, setStaffInviteLink] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const [inq, l, m, c, d, a] = await Promise.all([
      supabase
        .from("inquiries")
        .select(
          `
          id, buyer_id, message, status, created_at,
          listings ( id, maker, model, price_ex_tax ),
          buyer:profiles!inquiries_buyer_id_fkey ( store_name, email )
        `,
        )
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("listings")
        .select(
          "id, maker, model, price_ex_tax, status, inspection_status, engine_video_url, profiles!listings_seller_id_fkey ( store_name )",
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
          buyer_confirmed_at, seller_confirmed_at,
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
    ]);
    setInquiries(
      (inq.data ?? []).map((row) => {
        const listing = Array.isArray(row.listings) ? row.listings[0] : row.listings;
        const buyer = Array.isArray(row.buyer) ? row.buyer[0] : row.buyer;
        return {
          id: row.id,
          buyer_id: row.buyer_id,
          message: row.message,
          status: row.status as InquiryRow["status"],
          created_at: row.created_at,
          listing: listing as InquiryRow["listing"],
          buyer: buyer as InquiryRow["buyer"],
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
        inspection_status: row.inspection_status ?? false,
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
    setDeals(
      (d.data ?? []).map((row) => {
        const listing = Array.isArray(row.listings) ? row.listings[0] : row.listings;
        const buyer = Array.isArray(row.buyer) ? row.buyer[0] : row.buyer;
        const seller = Array.isArray(row.seller) ? row.seller[0] : row.seller;
        return {
          id: row.id,
          status: row.status as DealStatus,
          agreed_price_ex_tax: row.agreed_price_ex_tax,
          transfer_overdue: row.transfer_overdue ?? false,
          transfer_deadline_at: row.transfer_deadline_at ?? null,
          buyer_confirmed_at: row.buyer_confirmed_at ?? null,
          seller_confirmed_at: row.seller_confirmed_at ?? null,
          listing: listing as { maker: string; model: string } | null,
          buyer: buyer as { store_name: string | null } | null,
          seller: seller as { store_name: string | null } | null,
        };
      }),
    );
    setDealAlerts((a.data ?? []) as typeof dealAlerts);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const removeListing = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from("listings").update({ status: "removed" }).eq("id", id);
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

  const toggleInspection = async (id: string, current: boolean) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("listings")
      .update({ inspection_status: !current })
      .eq("id", id);
    setMessage(error ? error.message : !current ? "査定済にしました。" : "査定済を解除しました。");
    load();
  };

  const setVerification = async (id: string, status: VerificationStatus) => {
    const supabase = createClient();
    const payload: {
      verification_status: VerificationStatus;
      verified_at?: string | null;
    } = { verification_status: status };
    if (status === "verified") payload.verified_at = new Date().toISOString();
    if (status !== "verified") payload.verified_at = null;
    const { error } = await supabase.from("profiles").update(payload).eq("id", id);
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

  const advanceDeal = async (id: string, status: DealStatus) => {
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_advance_deal", {
      p_deal_id: id,
      p_status: status,
    });
    setMessage(
      error ? error.message : `取引を「${DEAL_STATUS_LABELS[status]}」に更新しました。`,
    );
    load();
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
    const { data, error } = await supabase.rpc("check_transfer_deadlines");
    if (error) {
      setMessage(error.message);
      return;
    }
    const r = data as { overdue_flagged?: number; due_soon_notified?: number };
    setMessage(
      `名変期限チェック: 超過 ${r.overdue_flagged ?? 0}件 / 間近通知 ${r.due_soon_notified ?? 0}件`,
    );
    load();
  };

  const complaintLabel = (t: ComplaintType) =>
    COMPLAINT_TYPES.find((x) => x.value === t)?.label ?? t;

  const fee = (price: number) => formatYen(Math.round(price * FEE_RATE));

  return (
    <AppShell isAdmin>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">管理画面</h1>
            <p className="mt-1 text-sm text-muted">
              問い合わせ対応 / クレーム / 成約・名変期限
            </p>
          </div>
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
              ["inquiries", "問い合わせ"],
              ["complaints", "クレーム"],
              ["listings", "出品"],
              ["members", "会員"],
              ["deals", "取引"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-lg px-4 py-2 text-sm ${
                tab === key ? "bg-accent text-black" : "bg-zinc-900 text-muted"
              }`}
            >
              {label}
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
                      <button
                        type="button"
                        onClick={() => startDealFromInquiry(row)}
                        className="text-emerald-300 hover:underline"
                      >
                        取引を作成
                      </button>
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
                    <button
                      type="button"
                      onClick={() => toggleInspection(row.id, row.inspection_status)}
                      className={
                        row.inspection_status ? "text-violet-300" : "text-muted hover:underline"
                      }
                    >
                      {row.inspection_status ? "査定済 ✓" : "未査定"}
                    </button>
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={checkTransferDeadlines}
                className="rounded-lg border border-amber-500/40 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/10"
              >
                名変期限をチェック
              </button>
            </div>

            {dealAlerts.length > 0 ? (
              <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-sm font-medium text-amber-200">取引警告</p>
                {dealAlerts.map((a) => (
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
                    <th className="px-4 py-3">確認</th>
                    <th className="px-4 py-3">名変</th>
                    <th className="px-4 py-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 align-top">
                      <td className="px-4 py-3">
                        {row.listing ? `${row.listing.maker} ${row.listing.model}` : "—"}
                        <Link
                          href={`/deals/${row.id}`}
                          className="mt-1 block text-xs text-accent hover:underline"
                        >
                          詳細
                        </Link>
                      </td>
                      <td className="px-4 py-3">{row.seller?.store_name ?? "—"}</td>
                      <td className="px-4 py-3">{row.buyer?.store_name ?? "—"}</td>
                      <td className="px-4 py-3">
                        {formatYen(row.agreed_price_ex_tax)}
                        <span className="block text-xs text-muted">{fee(row.agreed_price_ex_tax)}/側</span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={row.status}
                          onChange={(e) => advanceDeal(row.id, e.target.value as DealStatus)}
                          className="rounded border border-border bg-zinc-950 px-2 py-1 text-xs"
                        >
                          {DEAL_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {DEAL_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
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
                        {row.status === "awaiting_payment" ? (
                          <button
                            type="button"
                            onClick={() => advanceDeal(row.id, "funded")}
                            className="block text-emerald-300 hover:underline"
                          >
                            入金確認
                          </button>
                        ) : null}
                        {row.status === "payout_ready" ? (
                          <button
                            type="button"
                            onClick={() => advanceDeal(row.id, "payout_done")}
                            className="block text-emerald-300 hover:underline"
                          >
                            振込完了
                          </button>
                        ) : null}
                        {row.status === "payout_done" ? (
                          <button
                            type="button"
                            onClick={() => advanceDeal(row.id, "completed")}
                            className="block text-emerald-300 hover:underline"
                          >
                            完了
                          </button>
                        ) : null}
                        {row.status !== "cancelled" && row.status !== "completed" ? (
                          <button
                            type="button"
                            onClick={() => advanceDeal(row.id, "cancelled")}
                            className="block text-muted hover:underline"
                          >
                            取消
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">
              新規取引は SQL の admin_create_deal または今後の問い合わせ連携から作成。振込は双方確認（payout_ready）後のみ。
            </p>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
