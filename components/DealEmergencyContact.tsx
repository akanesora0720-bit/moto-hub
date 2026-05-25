"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EMERGENCY_CONTACT_CONFIRM_MESSAGE,
  type EmergencySellerContact,
} from "@/lib/deal-board";
import { createClient } from "@/lib/supabase/client";

export function DealEmergencyContact({
  dealId,
  role,
  boardVisible,
}: {
  dealId: string;
  role: "buyer" | "seller" | "admin";
  boardVisible: boolean;
}) {
  const [contact, setContact] = useState<EmergencySellerContact | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("get_emergency_seller_contact", {
      p_deal_id: dealId,
    });
    if (err) return;
    const payload = data as { revealed?: boolean; seller?: EmergencySellerContact };
    if (payload?.revealed && payload.seller) {
      setRevealed(true);
      setContact(payload.seller);
    }
  }, [dealId]);

  useEffect(() => {
    if (boardVisible && (role === "buyer" || role === "admin")) {
      void load();
    }
  }, [boardVisible, role, load]);

  if (!boardVisible) return null;
  if (role === "seller") {
    return (
      <p className="text-xs text-muted">
        買い手は緊急時のみ、ここからあなたの電話番号を表示できます。通常の連絡は連絡板へ。
      </p>
    );
  }

  const reveal = async () => {
    if (!window.confirm(EMERGENCY_CONTACT_CONFIRM_MESSAGE)) return;
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("reveal_emergency_seller_contact", {
      p_deal_id: dealId,
      p_reason: null,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    const payload = data as { revealed?: boolean; seller?: EmergencySellerContact };
    if (payload?.seller) {
      setContact(payload.seller);
      setRevealed(true);
    }
  };

  if (revealed && contact) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-950/25 p-3 text-sm">
        <p className="text-xs font-medium text-amber-200">緊急連絡先（売り手）</p>
        <dl className="mt-2 space-y-1">
          {contact.store_name ? (
            <div>
              <dt className="inline text-muted">店舗: </dt>
              <dd className="inline">{contact.store_name}</dd>
            </div>
          ) : null}
          <div>
            <dt className="inline text-muted">担当: </dt>
            <dd className="inline">{contact.contact_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="inline text-muted">電話: </dt>
            <dd className="inline font-medium text-accent">
              {contact.phone ? (
                <a href={`tel:${contact.phone}`} className="hover:underline">
                  {contact.phone}
                </a>
              ) : (
                "未登録"
              )}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted">
          連絡後も、内容の記録は取引連絡板への投稿をお願いします。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={loading}
        onClick={() => void reveal()}
        className="w-full rounded-lg border border-amber-500/50 bg-amber-950/30 px-4 py-2.5 text-sm font-medium text-amber-100 hover:border-amber-400 disabled:opacity-50"
      >
        {loading ? "表示中…" : "緊急連絡先を表示"}
      </button>
      <p className="text-xs text-muted">
        引取当日の道迷い・遅延・積載不可など、連絡板だけでは間に合わない場合のみご利用ください。
      </p>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
