"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  AI_CONFIDENCE_WARN_THRESHOLD,
  AI_LISTING_FIELD_LABELS,
  type AiListingDraftItemRow,
  confidencePercent,
  inferVehicleClassFromCc,
  isLowConfidence,
} from "@/lib/ai-listing";
import { VEHICLE_CLASSES, type VehicleClass } from "@/lib/constants";
import { formatYen } from "@/lib/format";

type WizardStep = "upload" | "processing" | "preview" | "done";

type EditableItem = AiListingDraftItemRow & {
  vehicle_class: VehicleClass | "";
  selected: boolean;
};

function toEditable(row: Record<string, unknown>): EditableItem {
  const r = row as AiListingDraftItemRow;
  return {
    ...r,
    vehicle_class: inferVehicleClassFromCc(r.displacement_cc),
    selected: true,
  };
}

function ConfidenceBadge({ field, confidence }: { field: string; confidence: Record<string, number> }) {
  const pct = confidencePercent(confidence[field]);
  const low = isLowConfidence(confidence[field]);
  if (pct == null) return null;
  return (
    <span
      className={`text-[10px] ${low ? "font-semibold text-amber-400" : "text-muted"}`}
      title={low ? "確認推奨" : undefined}
    >
      {AI_LISTING_FIELD_LABELS[field] ?? field}: {pct}%
      {low ? " ⚠" : ""}
    </span>
  );
}

export function AiListingImportWizard() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const analyze = useCallback(async () => {
    if (!file) {
      setMessage("画像を選択してください。");
      return;
    }
    setMessage("");
    setLoading(true);
    setStep("processing");

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/ai-listing/analyze", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "解析に失敗しました。");
        setStep("upload");
        return;
      }
      setJobId(data.jobId as string);
      const rows = ((data.items ?? []) as Record<string, unknown>[]).map(toEditable);
      if (rows.length === 0) {
        setMessage("車両を検出できませんでした。別の画像をお試しください。");
        setStep("upload");
        return;
      }
      setItems(rows);
      setStep("preview");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "通信エラー");
      setStep("upload");
    } finally {
      setLoading(false);
    }
  }, [file]);

  const updateItem = (id: string, patch: Partial<EditableItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const saveDrafts = async () => {
    const selected = items.filter((i) => i.selected);
    if (!jobId || selected.length === 0) {
      setMessage("保存する車両を1件以上選択してください。");
      return;
    }
    for (const it of selected) {
      if (!it.maker?.trim() || !it.model?.trim() || !it.frame_number?.trim() || !it.price_ex_tax) {
        setMessage("選択した行に未入力の必須項目があります。");
        return;
      }
      if (!it.vehicle_class) {
        setMessage("車種区分を選択してください。");
        return;
      }
    }

    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/ai-listing/jobs/${jobId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selected.map((it) => ({
            id: it.id,
            maker: it.maker,
            model: it.model,
            vehicle_class: it.vehicle_class,
            displacement_cc: it.displacement_cc,
            year: it.year,
            mileage: it.mileage,
            inspection_text: it.inspection_text,
            insurance_text: it.insurance_text,
            color: it.color,
            frame_number: it.frame_number,
            price_ex_tax: it.price_ex_tax,
            total_price_inc_tax: it.total_price_inc_tax,
            repair_history: it.repair_history,
            warranty_text: it.warranty_text,
            maintenance_text: it.maintenance_text,
            comment: it.comment,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "保存に失敗しました。");
        return;
      }
      setMessage(data.message ?? "保存しました。");
      setStep("done");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "通信エラー");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">AI出品サポート</h1>
        <p className="mt-2 text-sm text-muted">
          GooBike等の在庫画面のスクリーンショットをアップロードすると、AIが車両情報を読み取り
          <strong className="text-foreground"> 出品下書き </strong>
          を作成します。自動公開はしません。サムネイル画像は出品写真として使いません。
        </p>
      </div>

      <ol className="flex flex-wrap gap-2 text-xs text-muted">
        {[
          ["upload", "①画像"],
          ["processing", "②解析"],
          ["preview", "③確認・編集"],
          ["done", "④保存"],
        ].map(([key, label]) => (
          <li
            key={key}
            className={`rounded-full border px-3 py-1 ${
              step === key ? "border-accent text-accent" : "border-border"
            }`}
          >
            {label}
          </li>
        ))}
      </ol>

      {step === "upload" ? (
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <label className="block text-sm">
            <span className="text-muted">スクリーンショット（PNG / JPG）</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-medium file:text-black"
            />
          </label>
          <button
            type="button"
            disabled={!file || loading}
            onClick={() => void analyze()}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            解析を開始
          </button>
        </div>
      ) : null}

      {step === "processing" ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted">
          AIが画像を解析しています…（数十秒かかることがあります）
        </div>
      ) : null}

      {step === "preview" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {items.length}台を検出しました。信頼度が
            {Math.round(AI_CONFIDENCE_WARN_THRESHOLD * 100)}%未満の項目は⚠で表示されます。
          </p>
          {items.map((it) => (
            <div
              key={it.id}
              className="space-y-3 rounded-xl border border-border bg-card p-4"
            >
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={it.selected}
                  onChange={(e) => updateItem(it.id, { selected: e.target.checked })}
                />
                下書きに含める
              </label>
              <div className="flex flex-wrap gap-2">
                {Object.keys(AI_LISTING_FIELD_LABELS).map((f) => (
                  <ConfidenceBadge key={f} field={f} confidence={it.field_confidence ?? {}} />
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="text-muted">メーカー *</span>
                  <input
                    value={it.maker ?? ""}
                    onChange={(e) => updateItem(it.id, { maker: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-muted">車種名 *</span>
                  <input
                    value={it.model ?? ""}
                    onChange={(e) => updateItem(it.id, { model: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-muted">車種区分 *</span>
                  <select
                    value={it.vehicle_class}
                    onChange={(e) =>
                      updateItem(it.id, { vehicle_class: e.target.value as VehicleClass })
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
                  >
                    <option value="">選択</option>
                    {VEHICLE_CLASSES.map((v) => (
                      <option key={v.value} value={v.value}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="text-muted">排気量 cc</span>
                  <input
                    type="number"
                    value={it.displacement_cc ?? ""}
                    onChange={(e) =>
                      updateItem(it.id, {
                        displacement_cc: e.target.value ? parseInt(e.target.value, 10) : null,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-muted">年式</span>
                  <input
                    type="number"
                    value={it.year ?? ""}
                    onChange={(e) =>
                      updateItem(it.id, { year: e.target.value ? parseInt(e.target.value, 10) : null })
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-muted">走行距離 km</span>
                  <input
                    type="number"
                    value={it.mileage ?? ""}
                    onChange={(e) =>
                      updateItem(it.id, {
                        mileage: e.target.value ? parseInt(e.target.value, 10) : null,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="text-muted">車体番号 *</span>
                  <input
                    value={it.frame_number ?? ""}
                    onChange={(e) => updateItem(it.id, { frame_number: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 font-mono text-sm"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-muted">本体価格（税抜・円）*</span>
                  <input
                    type="number"
                    value={it.price_ex_tax ?? ""}
                    onChange={(e) =>
                      updateItem(it.id, {
                        price_ex_tax: e.target.value ? parseInt(e.target.value, 10) : null,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
                  />
                  {it.price_ex_tax ? (
                    <span className="text-xs text-muted">{formatYen(it.price_ex_tax)}</span>
                  ) : null}
                </label>
                <label className="text-sm">
                  <span className="text-muted">支払総額（参考・円）</span>
                  <input
                    type="number"
                    value={it.total_price_inc_tax ?? ""}
                    onChange={(e) =>
                      updateItem(it.id, {
                        total_price_inc_tax: e.target.value
                          ? parseInt(e.target.value, 10)
                          : null,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-muted">色</span>
                  <input
                    value={it.color ?? ""}
                    onChange={(e) => updateItem(it.id, { color: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-muted">車検</span>
                  <input
                    value={it.inspection_text ?? ""}
                    onChange={(e) => updateItem(it.id, { inspection_text: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="text-muted">コメント</span>
                  <textarea
                    value={it.comment ?? ""}
                    onChange={(e) => updateItem(it.id, { comment: e.target.value })}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </div>
          ))}
          <button
            type="button"
            disabled={loading}
            onClick={() => void saveDrafts()}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {loading ? "保存中…" : "選択した車両を下書き保存"}
          </button>
        </div>
      ) : null}

      {step === "done" ? (
        <div className="space-y-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-5">
          <p className="text-sm">{message}</p>
          <p className="text-sm text-muted">
            各下書きに写真（1枚以上）と7項目評価を追加してから公開してください。
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/listings/mine"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black"
            >
              自分の出品へ
            </Link>
            <button
              type="button"
              onClick={() => {
                setStep("upload");
                setFile(null);
                setJobId(null);
                setItems([]);
                setMessage("");
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm"
            >
              別の画像を解析
            </button>
          </div>
        </div>
      ) : null}

      {message && step !== "done" ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
