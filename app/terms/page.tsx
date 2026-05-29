import Link from "next/link";
import { TermsDocumentView } from "@/components/TermsDocumentView";
import { termsDocumentHref } from "@/lib/legal-policies";

export const metadata = {
  title: "利用規約",
  description: "MotoHub 利用規約",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="mb-6 text-sm">
          <Link href="/login" className="text-accent underline underline-offset-2">
            ← ログイン
          </Link>
        </p>
        <TermsDocumentView />
        <p className="mt-8 text-center text-xs text-muted">文書URL: {termsDocumentHref()}</p>
      </div>
    </div>
  );
}
