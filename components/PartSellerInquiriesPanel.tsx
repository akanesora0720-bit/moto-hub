"use client";

import { useState } from "react";
import { PartInquiryChatPanel } from "@/components/PartInquiryChatPanel";

export type PartInquirySummary = {
  id: string;
  buyer_id: string;
  status: string;
  updated_at: string;
};

export function PartSellerInquiriesPanel({
  inquiries,
  partListingId,
  sellerId,
  viewerId,
}: {
  inquiries: PartInquirySummary[];
  partListingId: string;
  sellerId: string;
  viewerId: string;
}) {
  const [selectedId, setSelectedId] = useState(inquiries[0]?.id ?? "");

  if (inquiries.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted">
        問い合わせはまだありません。
      </div>
    );
  }

  const selected = inquiries.find((i) => i.id === selectedId) ?? inquiries[0];
  const chatOpen = selected.status === "open";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold">問い合わせ一覧</h3>
        <ul className="mt-3 space-y-2">
          {inquiries.map((inq) => (
            <li key={inq.id}>
              <button
                type="button"
                onClick={() => setSelectedId(inq.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                  inq.id === selected.id
                    ? "border-accent bg-accent/10"
                    : "border-border hover:border-accent/50"
                }`}
              >
                <span className="font-mono text-xs text-muted">buyer: {inq.buyer_id.slice(0, 8)}…</span>
                <span className="mt-1 block text-xs text-muted">
                  {inq.status} · {new Date(inq.updated_at).toLocaleString("ja-JP")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selected ? (
        <PartInquiryChatPanel
          key={selected.id}
          inquiryId={selected.id}
          partListingId={partListingId}
          sellerId={sellerId}
          viewerId={viewerId}
          readOnly={!chatOpen}
        />
      ) : null}
    </div>
  );
}
