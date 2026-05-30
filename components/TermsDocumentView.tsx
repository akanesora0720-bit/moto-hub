import Link from "next/link";
import { PRICING_DOCUMENT_PATH } from "@/lib/legal-policies";
import {
  PRIVACY_ARTICLES,
  PRIVACY_EFFECTIVE_DATE,
  PRIVACY_FOOTER,
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
        <h1 className="text-2xl font-semibold text-zinc-100">利用規約・プライバシーポリシー</h1>
        <p className="mt-2 text-sm text-muted">施行日：{TERMS_EFFECTIVE_DATE}</p>
        <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <a href="#terms" className="font-medium text-accent underline underline-offset-2">
            利用規約
          </a>
          <a href="#privacy" className="font-medium text-accent underline underline-offset-2">
            プライバシーポリシー
          </a>
          {showFeesLink ? (
            <Link
              href={PRICING_DOCUMENT_PATH}
              className="font-medium text-accent underline underline-offset-2"
            >
              料金表
            </Link>
          ) : null}
        </nav>
      </header>

      <div id="terms" className="scroll-mt-6">
        <h2 className="not-prose mb-6 text-xl font-semibold text-zinc-100">利用規約</h2>
        {TERMS_ARTICLES.map((article) => (
          <section key={article.number} className="mb-8">
            <h3 className="text-base font-semibold text-zinc-100">
              第{article.number}条（{article.title}）
            </h3>
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

        <section className="mb-12 rounded-lg border border-border bg-zinc-900/40 px-4 py-3">
          <p className="text-sm leading-relaxed text-zinc-300">{TERMS_SUPPLEMENT}</p>
        </section>
      </div>

      <div id="privacy" className="scroll-mt-6 border-t border-border pt-10">
        <header className="not-prose mb-8">
          <h2 className="text-xl font-semibold text-zinc-100">プライバシーポリシー</h2>
          <p className="mt-2 text-sm text-muted">施行日：{PRIVACY_EFFECTIVE_DATE}</p>
          <p className="mt-3 leading-relaxed text-zinc-300">
            Moto-Hub（以下「当サービス」）は、当サービスにおけるユーザー情報の取扱いについて、以下のとおりプライバシーポリシー（以下「本ポリシー」）を定めます。
          </p>
        </header>

        {PRIVACY_ARTICLES.map((article) => (
          <section key={article.number} className="mb-8">
            <h3 className="text-base font-semibold text-zinc-100">
              第{article.number}条（{article.title}）
            </h3>
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
          <p>{PRIVACY_FOOTER}</p>
        </footer>
      </div>

      <footer className="not-prose mt-10 border-t border-border pt-4 text-xs text-muted">
        <p>お問い合わせ：本サービス内サポートまたは運営窓口</p>
        <p className="mt-1">運営：株式会社RideWorks（Moto-Hub）</p>
      </footer>
    </article>
  );
}
