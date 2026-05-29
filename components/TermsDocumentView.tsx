import Link from "next/link";
import { PRIVACY_DOCUMENT_PATH, PRICING_DOCUMENT_PATH } from "@/lib/legal-policies";
import {
  TERMS_ARTICLES,
  TERMS_EFFECTIVE_DATE,
  TERMS_SUPPLEMENT,
} from "@/lib/terms-document";

type Props = {
  showFeesLink?: boolean;
  className?: string;
};

export function TermsDocumentView({ showFeesLink = true, className }: Props) {
  return (
    <article className={`prose prose-invert max-w-none text-sm ${className ?? ""}`}>
      <header className="not-prose mb-8 border-b border-border pb-6">
        <h1 className="text-2xl font-semibold text-zinc-100">利用規約</h1>
        <p className="mt-2 text-sm text-muted">施行日：{TERMS_EFFECTIVE_DATE}</p>
        <p className="mt-3 text-sm text-muted">
          {showFeesLink ? (
            <>
              料金の詳細は{" "}
              <Link href={PRICING_DOCUMENT_PATH} className="font-medium text-accent underline underline-offset-2">
                料金表
              </Link>
              をご確認ください。
              {" · "}
            </>
          ) : null}
          プライバシーポリシーは{" "}
          <Link href={PRIVACY_DOCUMENT_PATH} className="font-medium text-accent underline underline-offset-2">
            こちら
          </Link>
        </p>
      </header>

      {TERMS_ARTICLES.map((article) => (
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

      <section className="mb-8 rounded-lg border border-border bg-zinc-900/40 px-4 py-3">
        <p className="text-sm leading-relaxed text-zinc-300">{TERMS_SUPPLEMENT}</p>
      </section>

      <footer className="not-prose border-t border-border pt-4 text-xs text-muted">
        <p>お問い合わせ：本サービス内サポートまたは運営窓口</p>
        <p className="mt-1">運営：株式会社RideWorks（Moto-Hub）</p>
      </footer>
    </article>
  );
}
