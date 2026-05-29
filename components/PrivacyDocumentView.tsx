import Link from "next/link";
import {
  PRIVACY_ARTICLES_V1,
  PRIVACY_FOOTER_V1,
  PRIVACY_VERSION_LABEL,
} from "@/lib/privacy-document-v1";
import { TERMS_DOCUMENT_PATH } from "@/lib/legal-policies";

type Props = {
  showTermsLink?: boolean;
  className?: string;
};

export function PrivacyDocumentView({ showTermsLink = true, className }: Props) {
  return (
    <article className={`prose prose-invert max-w-none text-sm ${className ?? ""}`}>
      <header className="not-prose mb-8 border-b border-border pb-6">
        <p className="text-xs text-muted">Moto-Hub プライバシーポリシー · {PRIVACY_VERSION_LABEL}</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-100">プライバシーポリシー</h1>
        <p className="mt-3 leading-relaxed text-zinc-300">
          Moto-Hub（以下「当サービス」）は、当サービスにおけるユーザー情報の取扱いについて、以下のとおりプライバシーポリシー（以下「本ポリシー」）を定めます。
        </p>
        {showTermsLink ? (
          <p className="mt-3 text-sm">
            利用規約は{" "}
            <Link href={TERMS_DOCUMENT_PATH} className="font-medium text-accent underline underline-offset-2">
              こちら
            </Link>
          </p>
        ) : null}
      </header>

      {PRIVACY_ARTICLES_V1.map((article) => (
        <section key={article.number} className="mb-8">
          <h2 className="text-base font-semibold text-zinc-100">
            第{article.number}条（{article.title}）
          </h2>
          <div className="mt-3 space-y-3 text-zinc-300">
            {article.paragraphs.map((p) => (
              <p key={p.slice(0, 40)} className="leading-relaxed">
                {p}
              </p>
            ))}
            {article.listItems?.length ? (
              <ol className="list-decimal space-y-2 pl-5">
                {article.listItems.map((item) => (
                  <li key={item.slice(0, 40)} className="leading-relaxed">
                    {item}
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        </section>
      ))}

      <footer className="not-prose border-t border-border pt-4 text-xs text-muted">
        <p>{PRIVACY_FOOTER_V1}</p>
      </footer>
    </article>
  );
}
