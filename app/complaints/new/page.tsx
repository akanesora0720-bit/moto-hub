"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { canBuyerFileComplaint } from "@/lib/complaint-eligibility";
import { DEAL_STATUS_LABELS } from "@/lib/deal-flow";
import { COMPLAINT_TYPES, penaltyForType } from "@/lib/trust";
import { createClient } from "@/lib/supabase/client";
import type { ComplaintType, DealStatus } from "@/lib/types";

function ComplaintForm() {
  const router = useRouter();
  const params = useSearchParams();
  const dealId = params.get("deal") ?? "";

  const [dealTitle, setDealTitle] = useState("");
  const [dealStatus, setDealStatus] = useState<DealStatus | null>(null);
  const [listingId, setListingId] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [type, setType] = useState<ComplaintType>("minor_condition");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!dealId) return;
    const supabase = createClient();
    supabase
      .from("deals")
      .select("id, status, buyer_id, seller_id, listing_id, listings ( maker, model )")
      .eq("id", dealId)
      .single()
      .then(async ({ data, error }) => {
        if (error || !data) {
          setMessage("取引が見つかりません。");
          return;
        }
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user || userData.user.id !== data.buyer_id) {
          setMessage("この取引の買い手のみクレームを申請できます。");
          return;
        }
        const status = data.status as DealStatus;
        if (!canBuyerFileComplaint(status)) {
          setMessage(
            `この取引段階（${DEAL_STATUS_LABELS[status]}）ではクレームできません。入金確認以降の取引から申請してください。`,
          );
          return;
        }
        const listing = Array.isArray(data.listings) ? data.listings[0] : data.listings;
        setDealTitle(listing ? `${listing.maker} ${listing.model}` : "—");
        setDealStatus(status);
        setListingId(data.listing_id);
        setSellerId(data.seller_id);
      });
  }, [dealId]);

  const submit = async () => {
    setMessage("");
    if (!dealId || !listingId || !sellerId) {
      setMessage("取引情報が不正です。");
      return;
    }
    if (!description.trim()) {
      setMessage("内容を入力してください。");
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

    const penalty = penaltyForType(type);
    const { error } = await supabase.from("complaints").insert({
      deal_id: dealId,
      listing_id: listingId,
      buyer_id: userData.user.id,
      seller_id: sellerId,
      complaint_type: type,
      description: description.trim(),
      penalty_score: penalty,
    });

    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("クレームを受け付けました。運営が審査します。");
    setTimeout(() => router.replace(`/deals/${dealId}`), 1500);
  };

  if (!dealId) {
    return (
      <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm">
        取引画面（/deals）から「問題を報告」を選んで申請してください。在庫詳細からは申請できません。
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">クレーム申請</h1>
        <p className="mt-1 text-sm text-muted">
          取引に関する問題のみ申請できます（入金確認以降）。承認後に出品者へ減点されます。
        </p>
        {dealTitle ? (
          <p className="mt-2 text-sm text-accent">
            対象: {dealTitle}
            {dealStatus ? (
              <span className="ml-2 text-muted">（{DEAL_STATUS_LABELS[dealStatus]}）</span>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <label className="block text-sm">
          <span className="text-muted">クレーム種別</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ComplaintType)}
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm"
          >
            {COMPLAINT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}（-{t.penalty}点）
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted">詳細 *</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm"
            placeholder="状態相違の内容、発見日、写真の有無など"
          />
        </label>
        <p className="text-xs text-zinc-500">
          申請時の予定減点: <strong className="text-foreground">-{penaltyForType(type)}点</strong>
          （管理者承認時に適用）
        </p>
      </div>

      {message ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">{message}</p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={loading || !listingId}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
      >
        {loading ? "送信中…" : "申請する"}
      </button>

      <Link href={`/deals/${dealId}`} className="block text-center text-sm text-muted hover:text-accent">
        取引に戻る
      </Link>
    </div>
  );
}

export default function NewComplaintPage() {
  return (
    <AppShell>
      <Suspense>
        <ComplaintForm />
      </Suspense>
    </AppShell>
  );
}
