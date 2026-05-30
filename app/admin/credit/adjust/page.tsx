import { Suspense } from "react";
import { AdminCreditAdjustPageClient } from "./AdminCreditAdjustPageClient";

export default function AdminCreditAdjustPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center p-8 text-sm text-muted">
          読み込み中…
        </div>
      }
    >
      <AdminCreditAdjustPageClient />
    </Suspense>
  );
}
