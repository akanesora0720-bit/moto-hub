"use client";

import { useState, type ReactNode } from "react";

export type DealDetailTab = "overview" | "documents";

export function DealDetailTabs({
  overview,
  documents,
  showDocumentsTab,
}: {
  overview: ReactNode;
  documents: ReactNode;
  showDocumentsTab: boolean;
}) {
  const [tab, setTab] = useState<DealDetailTab>("overview");

  if (!showDocumentsTab) {
    return <>{overview}</>;
  }

  return (
    <div className="space-y-4">
      <div
        className="flex gap-1 rounded-lg border border-border bg-card p-1"
        role="tablist"
        aria-label="取引詳細タブ"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "overview"}
          onClick={() => setTab("overview")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
            tab === "overview"
              ? "bg-accent text-accent-foreground"
              : "text-muted hover:text-foreground"
          }`}
        >
          概要
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "documents"}
          onClick={() => setTab("documents")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
            tab === "documents"
              ? "bg-accent text-accent-foreground"
              : "text-muted hover:text-foreground"
          }`}
        >
          書類
        </button>
      </div>
      {tab === "overview" ? overview : documents}
    </div>
  );
}
