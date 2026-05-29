import { Suspense } from "react";
import { TermsUpdatedClient } from "./TermsUpdatedClient";

export const metadata = {
  title: "利用規約の更新",
  description: "利用規約 v3 への再同意",
};

export default function TermsUpdatedPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Suspense
        fallback={
          <div className="px-4 py-10 text-center text-sm text-muted">読み込み中…</div>
        }
      >
        <TermsUpdatedClient />
      </Suspense>
    </div>
  );
}
