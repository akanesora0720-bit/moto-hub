"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { TermsDocumentView } from "@/components/TermsDocumentView";
import {
  CURRENT_TERMS_VERSION,
  PRICING_DOCUMENT_PATH,
  TERMS_DOCUMENT_PATH,
  termsDocumentAbsoluteUrl,
} from "@/lib/legal-policies";
import { createClient } from "@/lib/supabase/client";

export function TermsUpdatedClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/home";
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async () => {
    if (!agreed) {
      setMessage("利用規約（v3）を確認のうえ、同意にチェックを入れてください。");
      return;
    }
    setMessage("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("record_policy_acceptance", {
      p_policy_type: "terms",
      p_policy_version: CURRENT_TERMS_VERSION,
      p_pdf_url: termsDocumentAbsoluteUrl(window.location.origin),
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    const safeNext = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/home";
    router.replace(safeNext);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <header className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4">
        <h1 className="text-xl font-semibold text-amber-100">利用規約が更新されました</h1>
        <p className="mt-2 text-sm text-zinc-300">
          パーツ売買機能の追加に伴い、利用規約を改定（{CURRENT_TERMS_VERSION}）しました。
          内容をご確認のうえ同意いただくまで、本サービスの利用を一時的に制限しています。
        </p>
      </header>

      <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-border bg-zinc-900/50 p-5">
        <TermsDocumentView showFeesLink={false} />
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded border-border accent-accent"
          />
          <span>
            <Link
              href={TERMS_DOCUMENT_PATH}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent underline underline-offset-2"
            >
              利用規約（{CURRENT_TERMS_VERSION}）
            </Link>
            および{" "}
            <Link
              href={PRICING_DOCUMENT_PATH}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent underline underline-offset-2"
            >
              料金表
            </Link>
            を確認し、改定内容に同意します
            <span className="text-accent"> *</span>
          </span>
        </label>

        {message ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
            {message}
          </p>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={loading || !agreed}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
        >
          {loading ? "保存中…" : "同意して利用を再開する"}
        </button>
      </div>
    </div>
  );
}
