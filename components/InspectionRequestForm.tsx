"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MOTOHUB_INSPECTION_FEE_EX_TAX } from "@/lib/inspection";
import { createClient } from "@/lib/supabase/client";

export function InspectionRequestForm() {
  const router = useRouter();
  const [vehicleName, setVehicleName] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [contactName, setContactName] = useState("");
  const [preferredAt, setPreferredAt] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async () => {
    if (!vehicleName.trim() || !storageLocation.trim() || !contactName.trim()) {
      setMessage("車両名・保管場所・担当者は必須です。");
      return;
    }
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const preferredIso = preferredAt ? new Date(preferredAt).toISOString() : null;
    const { error } = await supabase.rpc("create_inspection_request", {
      p_vehicle_name: vehicleName.trim(),
      p_storage_location: storageLocation.trim(),
      p_contact_name: contactName.trim(),
      p_preferred_at: preferredIso,
      p_notes: notes.trim() || null,
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    router.refresh();
    setVehicleName("");
    setStorageLocation("");
    setContactName("");
    setPreferredAt("");
    setNotes("");
    setMessage("査定依頼を受け付けました。Moto-Hubスタッフからご連絡します。");
  };

  return (
    <div className="space-y-4 rounded-xl border border-sky-500/30 bg-sky-950/20 p-5">
      <div>
        <h2 className="text-lg font-semibold text-sky-100">Moto-Hub査定依頼</h2>
        <p className="mt-1 text-sm text-muted">
          Moto-Hubスタッフが現車確認・写真撮影・出品登録を代行します（1台 税抜 ¥
          {MOTOHUB_INSPECTION_FEE_EX_TAX.toLocaleString("ja-JP")}・別途消費税）。
          請求書は査定・出品代行の完了後に発行されます。
        </p>
        <p className="mt-2 text-xs text-muted">
          自己評価のみの出品とは異なり、完了後に「Moto-Hub査定済」バッジが付きます。
        </p>
      </div>

      <label className="block text-sm">
        <span className="text-muted">車両名 *</span>
        <input
          value={vehicleName}
          onChange={(e) => setVehicleName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5"
          placeholder="例: Honda CB400SF"
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted">保管場所 *</span>
        <input
          value={storageLocation}
          onChange={(e) => setStorageLocation(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5"
          placeholder="店舗名・住所・駐車位置など"
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted">担当者 *</span>
        <input
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5"
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted">希望日時</span>
        <input
          type="datetime-local"
          value={preferredAt}
          onChange={(e) => setPreferredAt(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5"
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted">備考</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5"
          placeholder="鍵の場所、陸送の有無など"
        />
      </label>

      <button
        type="button"
        disabled={loading}
        onClick={() => void submit()}
        className="w-full rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
      >
        {loading ? "送信中…" : "Moto-Hub査定を依頼する"}
      </button>

      {message ? (
        <p className={`text-sm ${message.includes("受け付け") ? "text-emerald-300" : "text-rose-300"}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
