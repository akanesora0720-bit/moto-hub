"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatDealMessageTime } from "@/lib/deal-board";
import { createClient } from "@/lib/supabase/client";

type Row = {
  id: string;
  deal_id: string;
  viewer_user_id: string;
  viewer_store_name: string | null;
  viewed_party_dealer_id: string;
  seller_store_name: string | null;
  viewed_at: string;
  reason: string | null;
  listing_label: string | null;
};

export function AdminEmergencyContactLog() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("list_emergency_contact_views_admin", {
      p_limit: 80,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setRows((data ?? []) as Row[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-muted">緊急連絡先開示履歴を読み込み中…</p>;
  }

  if (error) {
    return <p className="text-sm text-rose-300">{error}</p>;
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted">開示履歴はありません。</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th className="py-2 pr-3">日時</th>
            <th className="py-2 pr-3">車両</th>
            <th className="py-2 pr-3">閲覧者</th>
            <th className="py-2 pr-3">開示先（売り手）</th>
            <th className="py-2 pr-3">取引</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/50">
              <td className="py-2 pr-3 whitespace-nowrap text-xs">
                {formatDealMessageTime(r.viewed_at)}
              </td>
              <td className="py-2 pr-3">{r.listing_label ?? "—"}</td>
              <td className="py-2 pr-3">{r.viewer_store_name ?? r.viewer_user_id.slice(0, 8)}</td>
              <td className="py-2 pr-3">{r.seller_store_name ?? "—"}</td>
              <td className="py-2 pr-3">
                <Link href={`/admin/deals/${r.deal_id}`} className="text-accent hover:underline">
                  詳細
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
