"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import {
  DEFECT_SEVERITIES,
  DISPUTE_FEE_HANDLING_OPTIONS,
  DISPUTE_REQUESTED_OUTCOMES,
  DISPUTE_STATUS_LABELS,
  DISPUTE_TYPES,
  defectSeverityLabel,
  feeHandlingLabel,
  requestedOutcomeLabel,
} from "@/lib/disputes";
import { createClient } from "@/lib/supabase/client";
import { useAsyncAction } from "@/lib/use-async-action";
import type {
  DealStatus,
  DefectSeverity,
  DisputeFeeHandling,
  DisputeRequestedOutcome,
  DisputeStatus,
  DisputeType,
} from "@/lib/types";

type DisputeDetail = {
  id: string;
  deal_id: string;
  reporter_id: string;
  target_user_id: string;
  dispute_type: DisputeType;
  defect_severity: DefectSeverity | null;
  requested_outcome: DisputeRequestedOutcome;
  cancellation_reason: string | null;
  message: string;
  evidence: {
    id: string;
    storage_path: string;
    original_filename: string;
    mime_type: string;
    byte_size: number;
  }[];
  fee_handling: DisputeFeeHandling;
  fraud_suspected: boolean;
  admin_decision: string | null;
  admin_notes: string | null;
  seller_penalty_points: number | null;
  buyer_penalty_points: number | null;
  status: DisputeStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  reporter: { store_name: string | null; email: string | null } | null;
  target: { store_name: string | null; email: string | null } | null;
  deal: {
    status: DealStatus;
    listings: { maker: string; model: string } | { maker: string; model: string }[] | null;
  } | null;
};

function one<T>(row: T | T[] | null | undefined): T | null {
  if (!row) return null;
  return Array.isArray(row) ? (row[0] ?? null) : row;
}

function DisputeEvidenceList({
  evidence,
}: {
  evidence: DisputeDetail["evidence"];
}) {
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const open = async (ev: DisputeDetail["evidence"][number]) => {
    setOpeningId(ev.id);
    setErr(null);
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("deal-docs")
      .createSignedUrl(ev.storage_path, 300);
    setOpeningId(null);
    if (error || !data?.signedUrl) {
      setErr(error?.message ?? "署名付きURLの取得に失敗しました。");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  if (!evidence?.length) {
    return <p className="text-sm text-muted">証拠は登録されていません。</p>;
  }

  return (
    <ul className="space-y-2">
      {evidence.map((ev) => (
        <li key={ev.id} className="rounded border border-border bg-zinc-950/40 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs">
              {ev.original_filename}（{Math.round(ev.byte_size / 1024)}KB · {ev.mime_type}）
            </p>
            <button
              type="button"
              disabled={openingId === ev.id}
              onClick={() => void open(ev)}
              className="text-xs text-accent hover:underline disabled:opacity-50"
            >
              {openingId === ev.id ? "開いています…" : "閲覧"}
            </button>
          </div>
        </li>
      ))}
      {err ? <p className="text-xs text-rose-300">{err}</p> : null}
    </ul>
  );
}

export default function AdminDisputeDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [row, setRow] = useState<DisputeDetail | null>(null);
  const [message, setMessage] = useState<string>("");

  const [status, setStatus] = useState<DisputeStatus>("resolved");
  const [adminDecision, setAdminDecision] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [sellerPenalty, setSellerPenalty] = useState(0);
  const [buyerPenalty, setBuyerPenalty] = useState(0);
  const [feeHandling, setFeeHandling] = useState<DisputeFeeHandling>("pending");
  const [fraudSuspected, setFraudSuspected] = useState(false);

  const dealLink = useMemo(() => (row ? `/admin/deals/${row.deal_id}` : "/admin/disputes"), [row]);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    supabase
      .from("disputes")
      .select(
        `
        id, deal_id, reporter_id, target_user_id,
        dispute_type, defect_severity, requested_outcome, cancellation_reason,
        message, evidence, fee_handling, fraud_suspected,
        admin_decision, admin_notes,
        seller_penalty_points, buyer_penalty_points,
        status, reviewed_by, reviewed_at, created_at,
        reporter:profiles!disputes_reporter_id_fkey ( store_name, email ),
        target:profiles!disputes_target_user_id_fkey ( store_name, email ),
        deal:deals ( status, listings ( maker, model ) )
      `,
      )
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setMessage(error?.message ?? "dispute が見つかりません。");
          return;
        }
        const d = data as unknown as DisputeDetail & {
          reporter: DisputeDetail["reporter"] | DisputeDetail["reporter"][];
          target: DisputeDetail["target"] | DisputeDetail["target"][];
          deal: DisputeDetail["deal"] | DisputeDetail["deal"][];
        };
        const normalized: DisputeDetail = {
          ...d,
          reporter: one(d.reporter),
          target: one(d.target),
          deal: one(d.deal)
            ? {
                status: (one(d.deal) as NonNullable<DisputeDetail["deal"]>).status,
                listings: one((one(d.deal) as NonNullable<DisputeDetail["deal"]>).listings),
              }
            : null,
        };
        setRow(normalized);

        setStatus(normalized.status === "open" || normalized.status === "reviewing" ? "resolved" : normalized.status);
        setAdminDecision(normalized.admin_decision ?? "");
        setAdminNotes(normalized.admin_notes ?? "");
        setCancellationReason(normalized.cancellation_reason ?? "");
        setSellerPenalty(normalized.seller_penalty_points ?? 0);
        setBuyerPenalty(normalized.buyer_penalty_points ?? 0);
        setFeeHandling(normalized.fee_handling ?? "pending");
        setFraudSuspected(Boolean(normalized.fraud_suspected));
      });
  }, [id]);

  const { loading, success, run } = useAsyncAction();

  const finalize = () =>
    run(async () => {
      if (!row) return { error: "dispute が見つかりません。" };
      if (!adminDecision.trim()) return { error: "admin_decision（運営判断）を入力してください。" };
      const supabase = createClient();
      const { error } = await supabase.rpc("admin_finalize_dispute", {
        p_dispute_id: row.id,
        p_status: status,
        p_admin_decision: adminDecision.trim(),
        p_admin_notes: adminNotes.trim() || null,
        p_cancellation_reason: cancellationReason.trim() || null,
        p_seller_penalty_points: Number(sellerPenalty) || 0,
        p_buyer_penalty_points: Number(buyerPenalty) || 0,
        p_fee_handling: feeHandling,
        p_fraud_suspected: fraudSuspected,
        p_deal_status: null,
      });
      if (error) return { error: error.message };
      router.refresh();
      return { okMessage: "更新しました。" };
    });

  const listing = row?.deal?.listings;
  const li = Array.isArray(listing) ? listing[0] : listing;

  return (
    <AppShell isAdmin>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Dispute 詳細</h1>
            <p className="text-sm text-muted">
              {li ? `${li.maker} ${li.model}` : row?.deal_id.slice(0, 8)} ·{" "}
              {row ? new Date(row.created_at).toLocaleString("ja-JP") : "読込中…"}
            </p>
          </div>
          <div className="flex gap-3 text-sm">
            <Link href="/admin/disputes" className="text-accent hover:underline">
              ← 一覧
            </Link>
            {row ? (
              <Link href={dealLink} className="text-accent hover:underline">
                取引を開く →
              </Link>
            ) : null}
          </div>
        </div>

        {message ? (
          <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">{message}</p>
        ) : null}

        {!row ? (
          <p className="text-sm text-muted">読込中…</p>
        ) : (
          <>
            <section className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
              <p className="text-xs text-muted">当事者</p>
              <p>
                申告者: {row.reporter?.store_name ?? row.reporter?.email ?? row.reporter_id} / 対象:{" "}
                {row.target?.store_name ?? row.target?.email ?? row.target_user_id}
              </p>
              <p className="text-xs text-muted">申告内容</p>
              <p>
                種別: {DISPUTE_TYPES.find((t) => t.value === row.dispute_type)?.label ?? row.dispute_type}
                {row.dispute_type === "vehicle_defect" ? `（${defectSeverityLabel(row.defect_severity)}）` : null}
              </p>
              <p>希望対応: {requestedOutcomeLabel(row.requested_outcome)}</p>
              {row.cancellation_reason ? <p>キャンセル理由: {row.cancellation_reason}</p> : null}
              <p className="whitespace-pre-wrap">{row.message}</p>
            </section>

            <section className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
              <p className="text-xs text-muted">証拠（deal-docs · 署名付きURL）</p>
              <DisputeEvidenceList evidence={row.evidence ?? []} />
            </section>

            <section className="space-y-4 rounded-xl border border-border bg-zinc-950/40 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">運営判断</p>
                <p className="text-xs text-muted">
                  現在: {DISPUTE_STATUS_LABELS[row.status] ?? row.status} / 手数料扱い:{" "}
                  {feeHandlingLabel(row.fee_handling)}
                </p>
              </div>

              <label className="block space-y-1">
                <span className="text-muted">ステータス</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as DisputeStatus)}
                  className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
                >
                  <option value="resolved">解決</option>
                  <option value="rejected">却下</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-muted">admin_decision（必須）</span>
                <textarea
                  value={adminDecision}
                  onChange={(e) => setAdminDecision(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
                  placeholder="例: 実車差異を確認。売り手に重大瑕疵ペナルティ。手数料は通常請求。"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-muted">admin_notes（内部メモ）</span>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-muted">キャンセル理由（保存）</span>
                <textarea
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-muted">売り手ペナルティ（点）</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={sellerPenalty}
                    onChange={(e) => setSellerPenalty(Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-muted">買い手ペナルティ（点）</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={buyerPenalty}
                    onChange={(e) => setBuyerPenalty(Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-muted">手数料扱い</span>
                <select
                  value={feeHandling}
                  onChange={(e) => setFeeHandling(e.target.value as DisputeFeeHandling)}
                  className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
                >
                  {DISPUTE_FEE_HANDLING_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={fraudSuspected}
                  onChange={(e) => setFraudSuspected(e.target.checked)}
                />
                <span className="text-sm">fraud_suspected（口裏合わせ等の疑いあり）</span>
              </label>

              <button
                type="button"
                disabled={loading}
                onClick={finalize}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
              >
                {loading ? "更新中…" : success ? "更新済み" : "更新する"}
              </button>

              <p className="text-xs text-muted">
                ※この画面では取引ステータスの自動取消は行いません（既存フローを壊さないため）。必要なら取引画面の
                「ステータス強制変更」を使用してください。
              </p>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

