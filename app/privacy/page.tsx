import Link from "next/link";
import { PrivacyDocumentView } from "@/components/PrivacyDocumentView";
import { CURRENT_PRIVACY_VERSION, privacyDocumentHref } from "@/lib/legal-policies";

export const metadata = {
  title: "プライバシーポリシー",
  description: `Moto-Hub プライバシーポリシー ${CURRENT_PRIVACY_VERSION}`,
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="mb-6 text-sm">
          <Link href="/login" className="text-accent underline underline-offset-2">
            ← ログイン
          </Link>
        </p>
        <PrivacyDocumentView />
        <p className="mt-8 text-center text-xs text-muted">文書URL: {privacyDocumentHref()}</p>
      </div>
    </div>
  );
}
