"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DEAL_STATUS_LABELS } from "@/lib/deal-flow";
import {
  DEFECT_SEVERITIES,
  DISPUTE_REQUESTED_OUTCOMES,
  DISPUTE_TYPES,
  canFileDispute,
  disputeSuggestedPenalty,
} from "@/lib/disputes";
import {
  buildDisputeEvidenceStoragePath,
  DISPUTE_EVIDENCE_MAX_BYTES,
  DISPUTE_EVIDENCE_MAX_FILES,
  isAllowedDisputeEvidenceMime,
  type DisputeEvidenceItem,
} from "@/lib/dispute-evidence";
import { createClient } from "@/lib/supabase/client";
import type { DealStatus, DefectSeverity, DisputeRequestedOutcome, DisputeType } from "@/lib/types";

function DisputeForm() {
  const router = useRouter();
  const params = useSearchParams();
  const dealId = params.get("deal") ?? "";

  const [dealTitle, setDealTitle] = useState("");
  const [dealStatus, setDealStatus] = useState<DealStatus | null>(null);
  const [disputeType, setDisputeType] = useState<DisputeType>("vehicle_defect");
  const [defectSeverity, setDefectSeverity] = useState<DefectSeverity>("minor");
  const [requestedOutcome, setRequestedOutcome] =
    useState<DisputeRequestedOutcome>("consult");
  const [cancellationReason, setCancellationReason] = useState("");
  const [message, setMessage] = useState("");
  const [evidence, setEvidence] = useState<DisputeEvidenceItem[]>([]);
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

  const uploadEvidence = async (file: File) => {
    if (!dealId) return;
    if (!isAllowedDisputeEvidenceMime(file.type)) {
      setStatusMsg("証拠は PDF / 画像（JPEG/PNG/HEIC）/ 動画（MP4/MOV）のみアップロードできます。");
      return;
    }
    if (file.size > DISPUTE_EVIDENCE_MAX_BYTES) {
      setStatusMsg("ファイルサイズは 10MB 以下にしてください。");
      return;
    }
    if (evidence.length >= DISPUTE_EVIDENCE_MAX_FILES) {
      setStatusMsg(`証拠は最大 ${DISPUTE_EVIDENCE_MAX_FILES} 件までです。`);
      return;
    }

    setLoading(true);
    setStatusMsg("");
    const supabase = createClient();
    const evidenceId = crypto.randomUUID();
    const storagePath = buildDisputeEvidenceStoragePath(dealId, evidenceId, file.type);
    if (!storagePath) {
      setLoading(false);
      setStatusMsg("このファイル形式はアップロードできません。");
      return;
    }

    const { error: uploadError } = await supabase.storage
      .from("deal-docs")
      .upload(storagePath, file, { upsert: false, contentType: file.type });
    if (uploadError) {
      setLoading(false);
      setStatusMsg(uploadError.message);
      return;
    }

    const item: DisputeEvidenceItem = {
      id: evidenceId,
      storage_path: storagePath,
      original_filename: file.name,
      mime_type: file.type,
      byte_size: file.size,
    };
    setEvidence((prev) => [...prev, item]);
    setLoading(false);
    setStatusMsg("証拠をアップロードしました。");
  };

  const submit = async () => {
    setStatusMsg("");
    if (!dealId || !message.trim()) {
      setStatusMsg("内容を10文字以上入力してください。");
      return;
    }
    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase.rpc("submit_dispute", {
      p_deal_id: dealId,
      p_category: DISPUTE_TYPES.find((t) => t.value === disputeType)?.legacyCategory ?? "defect",
      p_message: message.trim(),
      p_images: [],
      p_dispute_type: disputeType,
      p_defect_severity: disputeType === "vehicle_defect" ? defectSeverity : null,
      p_requested_outcome: requestedOutcome,
      p_cancellation_reason:
        disputeType === "cancellation_request" ? cancellationReason.trim() || null : null,
      p_evidence: evidence,
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
        <span className="text-muted">報告の種類</span>
        <select
          value={disputeType}
          onChange={(e) => setDisputeType(e.target.value as DisputeType)}
          className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
        >
          {DISPUTE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-zinc-500">
          {DISPUTE_TYPES.find((t) => t.value === disputeType)?.description}
        </p>
      </label>

      {disputeType === "vehicle_defect" ? (
        <label className="block space-y-2 text-sm">
          <span className="text-muted">瑕疵の程度</span>
          <select
            value={defectSeverity}
            onChange={(e) => setDefectSeverity(e.target.value as DefectSeverity)}
            className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
          >
            {DEFECT_SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="block space-y-2 text-sm">
        <span className="text-muted">希望対応</span>
        <select
          value={requestedOutcome}
          onChange={(e) => setRequestedOutcome(e.target.value as DisputeRequestedOutcome)}
          className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
        >
          {DISPUTE_REQUESTED_OUTCOMES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {requestedOutcome === "cancel" || disputeType === "cancellation_request" ? (
        <label className="block space-y-2 text-sm">
          <span className="text-muted">キャンセル希望理由（任意）</span>
          <textarea
            value={cancellationReason}
            onChange={(e) => setCancellationReason(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
            placeholder="例: 現車の状態が説明と異なるため / 取引継続が困難 など"
          />
        </label>
      ) : null}

      <label className="block space-y-2 text-sm">
        <span className="text-muted">詳細（必須）</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
          placeholder="事実関係・日時・希望対応を記載"
        />
        <p className="text-xs text-zinc-500">
          このフォームは「キャンセル申請」ではなく、事実確認・協議のための報告です。虚偽申告や口裏合わせ、
          手数料回避目的の申告はペナルティ対象になり得ます。
        </p>
      </label>

      <div className="space-y-2 text-sm">
        <p className="text-muted">写真・動画など証拠（任意）</p>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,video/mp4,video/quicktime"
          disabled={loading || evidence.length >= DISPUTE_EVIDENCE_MAX_FILES}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            void uploadEvidence(f);
            e.currentTarget.value = "";
          }}
          className="block w-full text-xs"
        />
        <p className="text-xs text-zinc-500">
          最大 {DISPUTE_EVIDENCE_MAX_FILES} 件 / 1件 10MB。PDF・画像・動画のみ。
        </p>
        {evidence.length ? (
          <ul className="space-y-1 text-xs">
            {evidence.map((ev) => (
              <li key={ev.id} className="rounded border border-border bg-card px-2 py-1">
                {ev.original_filename}（{Math.round(ev.byte_size / 1024)}KB）
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <p className="text-xs text-zinc-500">
        期限超過系は原則自動減点（1営業日 −5）。その他は運営が悪質性・故意性等を踏まえて判断（目安 −
        {disputeSuggestedPenalty(
          disputeType,
          disputeType === "vehicle_defect" ? defectSeverity : null,
        )}
        点）。
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
          報告しても取引は自動キャンセル・自動停止されません。
        </p>
        <Suspense fallback={<p className="text-sm text-muted">読込中…</p>}>
          <DisputeForm />
        </Suspense>
      </div>
    </AppShell>
  );
}
