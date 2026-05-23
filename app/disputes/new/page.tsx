"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DEAL_STATUS_LABELS } from "@/lib/deal-flow";
import {
  DISPUTE_CATEGORIES,
  canFileDispute,
  disputePenaltyForCategory,
} from "@/lib/disputes";
import { createClient } from "@/lib/supabase/client";
import type { DealStatus, DisputeCategory } from "@/lib/types";

function DisputeForm() {
  const router = useRouter();
  const params = useSearchParams();
  const dealId = params.get("deal") ?? "";

  const [dealTitle, setDealTitle] = useState("");
  const [dealStatus, setDealStatus] = useState<DealStatus | null>(null);
  const [category, setCategory] = useState<DisputeCategory>("defect");
  const [message, setMessage] = useState("");
  const [imageNote, setImageNote] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!dealId) return;
    const supabase = createClient();
    supabase
      .from("deals")
      .select("id, status, buyer_id, seller_id, listings ( maker, model )")
      .eq("id", dealId)
      .single()
      .then(async ({ data, error }) => {
        if (error || !data) {
          setStatusMsg("取引が見つかりません。");
          return;
        }
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid || (uid !== data.buyer_id && uid !== data.seller_id)) {
          setStatusMsg("取引当事者のみ申告できます。");
          return;
        }
        const st = data.status as DealStatus;
        if (!canFileDispute(st)) {
          setStatusMsg(
            `この段階（${DEAL_STATUS_LABELS[st]}）では申告できません。入金確認以降から可能です。`,
          );
          return;
        }
        const listing = Array.isArray(data.listings) ? data.listings[0] : data.listings;
        setDealTitle(listing ? `${listing.maker} ${listing.model}` : "—");
        setDealStatus(st);
      });
  }, [dealId]);

  const submit = async () => {
    setStatusMsg("");
    if (!dealId || !message.trim()) {
      setStatusMsg("内容を10文字以上入力してください。");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const images = imageNote
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const { error } = await supabase.rpc("submit_dispute", {
      p_deal_id: dealId,
      p_category: category,
      p_message: message.trim(),
      p_images: images,
    });

    setLoading(false);
    if (error) {
      setStatusMsg(error.message);
      return;
    }
    setStatusMsg("申告を受け付けました。運営が必要最低限の範囲で審査します。");
    setTimeout(() => router.replace(`/deals/${dealId}`), 1500);
  };

  if (!dealId) {
    return (
      <p className="text-sm text-muted">
        取引詳細から「トラブル申告」を選んでください。
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">対象取引</p>
        <p className="font-medium">{dealTitle || "読込中…"}</p>
        {dealStatus ? (
          <p className="text-xs text-muted">{DEAL_STATUS_LABELS[dealStatus]}</p>
        ) : null}
      </div>

      <label className="block space-y-2 text-sm">
        <span className="text-muted">カテゴリ</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as DisputeCategory)}
          className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
        >
          {DISPUTE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}（減点候補 -{c.penalty}点）
            </option>
          ))}
        </select>
        <p className="text-xs text-zinc-500">
          {DISPUTE_CATEGORIES.find((c) => c.value === category)?.description}
        </p>
      </label>

      <label className="block space-y-2 text-sm">
        <span className="text-muted">詳細（必須）</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
          placeholder="事実関係・日時・希望対応を記載"
        />
      </label>

      <label className="block space-y-2 text-sm">
        <span className="text-muted">画像URL（任意・1行1件）</span>
        <textarea
          value={imageNote}
          onChange={(e) => setImageNote(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 font-mono text-xs"
          placeholder="https://..."
        />
      </label>

      <p className="text-xs text-zinc-500">
        減点候補: -{disputePenaltyForCategory(category)}点（運営判断・事実確認後）
      </p>

      {statusMsg ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">{statusMsg}</p>
      ) : null}

      <button
        type="button"
        disabled={loading}
        onClick={submit}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
      >
        {loading ? "送信中…" : "運営へ申告"}
      </button>
    </div>
  );
}

export default function NewDisputePage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-lg space-y-6">
        <Link href="/deals" className="text-sm text-muted hover:text-accent">
          ← 取引一覧
        </Link>
        <h1 className="text-2xl font-semibold">トラブル申告（dispute）</h1>
        <p className="text-sm text-muted">
          書類・虚偽・瑕疵・不正など、必要最低限の事案のみ。運営が審査します。
        </p>
        <Suspense fallback={<p className="text-sm text-muted">読込中…</p>}>
          <DisputeForm />
        </Suspense>
      </div>
    </AppShell>
  );
}
