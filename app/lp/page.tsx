import Link from "next/link";
import { LpHeader } from "@/components/lp/LpHeader";
import { LpSection } from "@/components/lp/LpSection";
import { MotohubLogo } from "@/components/MotohubLogo";
import { BRAND } from "@/lib/brand";
import { LP_CONTENT } from "@/lib/lp-content";
import { PRICING_DOCUMENT_PATH, TERMS_DOCUMENT_PATH, PRIVACY_DOCUMENT_PATH } from "@/lib/legal-policies";

export const metadata = {
  title: "Moto-Hub — 二輪業界の新しい流通インフラ",
  description:
    "全国の加盟店在庫をオンラインで繋ぐB2Bプラットフォーム。古物商向け・買い手手数料0円・先行加盟キャンペーン実施中。",
  openGraph: {
    title: "Moto-Hub — 二輪業界の新しい流通インフラ",
    description: "加盟店同士が直接商談して仕入れ・販売できる、二輪業界の新しい流通インフラ。",
    url: `${BRAND.siteUrl}/lp`,
  },
};

export default function LandingPage() {
  const c = LP_CONTENT;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LpHeader />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% -10%, rgba(212,168,83,0.18) 0%, transparent 55%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
          <span className="inline-block rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            {c.hero.eyebrow}
          </span>
          <h1 className="mt-6 max-w-3xl text-3xl font-bold leading-tight tracking-tight md:text-5xl">
            {c.hero.title}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">{c.hero.subtitle}</p>
          <p className="mt-3 text-sm text-muted">{c.hero.company}</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href={BRAND.signupUrl}
              className="rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-black hover:opacity-90"
            >
              {c.cta.primary}
            </Link>
            <Link
              href={BRAND.loginUrl}
              className="rounded-lg border border-border px-6 py-3 text-sm font-medium hover:border-accent/50"
            >
              {c.cta.login}
            </Link>
          </div>
        </div>
      </section>

      {/* Problem */}
      <LpSection id="problem" tag={c.problem.tag} title={c.problem.title} lead={c.problem.lead}>
        <div className="grid gap-8 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="text-sm font-semibold text-accent">現在の仕入れ方法</h3>
            <ul className="mt-4 flex flex-wrap gap-2">
              {c.problem.sources.map((item) => (
                <li
                  key={item}
                  className="rounded-lg border border-border bg-zinc-950/50 px-3 py-1.5 text-sm"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="text-sm font-semibold text-accent">その結果</h3>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed">
              {c.problem.outcomes.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-accent" aria-hidden>
                    ·
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </LpSection>

      {/* Solution */}
      <LpSection
        id="solution"
        tag={c.solution.tag}
        title={c.solution.title}
        lead={c.solution.lead}
        className="border-t border-border bg-zinc-950/40"
      >
        <ul className="max-w-2xl space-y-3 text-base leading-relaxed">
          {c.solution.points.map((p) => (
            <li key={p} className="flex gap-3">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </LpSection>

      {/* Features */}
      <LpSection id="features" tag={c.features.tag} title={c.features.title}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {c.features.items.map((f) => (
            <article
              key={f.title}
              className="rounded-2xl border border-border bg-card p-5 transition hover:border-accent/30"
            >
              <h3 className="text-lg font-semibold text-accent">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.description}</p>
            </article>
          ))}
        </div>
      </LpSection>

      {/* Philosophy */}
      <LpSection
        id="philosophy"
        tag={c.philosophy.tag}
        title={c.philosophy.title}
        className="border-t border-border bg-zinc-950/40"
      >
        <div className="max-w-2xl space-y-4 text-base leading-relaxed text-muted">
          {c.philosophy.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </LpSection>

      {/* Delivery */}
      <LpSection id="delivery" tag={c.delivery.tag} title={c.delivery.title} lead={c.delivery.lead}>
        <div className="grid gap-4 md:grid-cols-2">
          {c.delivery.cards.map((card) => (
            <article key={card.title} className="rounded-2xl border border-border bg-card p-6">
              <h3 className="font-semibold">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{card.body}</p>
            </article>
          ))}
        </div>
      </LpSection>

      {/* Pricing */}
      <LpSection
        id="pricing"
        tag={c.pricing.tag}
        title={c.pricing.title}
        className="border-t border-border bg-zinc-950/40"
      >
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
          {c.pricing.buyerPolicy}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[c.pricing.vehicle, c.pricing.parts].map((block) => (
            <div key={block.title} className="rounded-2xl border border-border bg-card p-6">
              <h3 className="font-semibold">{block.title}</h3>
              <table className="mt-4 w-full text-sm">
                <tbody>
                  {block.rows.map((row) => (
                    <tr key={row.label} className="border-t border-border first:border-t-0">
                      <th className="py-2 pr-4 text-left font-normal text-muted">{row.label}</th>
                      <td className="py-2 text-right font-medium">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted">
          {c.pricing.note}{" "}
          <Link href={PRICING_DOCUMENT_PATH} className="text-accent underline underline-offset-2">
            料金表
          </Link>
        </p>
      </LpSection>

      {/* Campaign */}
      <LpSection id="campaign" tag={c.campaign.tag} title={c.campaign.title}>
        <div className="rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/15 to-transparent p-8 md:p-10">
          <p className="text-3xl font-bold text-accent md:text-4xl">{c.campaign.highlight}</p>
          <p className="mt-4 max-w-2xl text-base leading-relaxed">{c.campaign.detail}</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <div className="rounded-xl border border-border bg-card px-5 py-3">
              <p className="text-xs text-muted">申請期限</p>
              <p className="mt-1 font-semibold">{c.campaign.deadline}</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-5 py-3">
              <p className="text-xs text-muted">無料対象月</p>
              <p className="mt-1 font-semibold">{c.campaign.freeMonths}</p>
            </div>
          </div>
        </div>
      </LpSection>

      {/* CTA */}
      <section className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center md:px-6 md:py-20">
          <div className="mb-6 flex justify-center">
            <MotohubLogo priority labelClassName="text-2xl" />
          </div>
          <h2 className="text-2xl font-bold md:text-3xl">{c.cta.title}</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted">{c.cta.subtitle}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={BRAND.signupUrl}
              className="rounded-lg bg-accent px-8 py-3 font-semibold text-black hover:opacity-90"
            >
              {c.cta.primary}
            </Link>
            <Link
              href={`mailto:${BRAND.contactEmail}`}
              className="rounded-lg border border-border px-8 py-3 font-medium hover:border-accent/50"
            >
              {BRAND.contactEmail}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted">
        <p>
          {BRAND.companyName} · {BRAND.productName} β
        </p>
        <p className="mt-2">
          <Link href={TERMS_DOCUMENT_PATH} className="hover:text-accent">
            利用規約
          </Link>
          {" · "}
          <Link href={PRIVACY_DOCUMENT_PATH} className="hover:text-accent">
            プライバシー
          </Link>
          {" · "}
          <Link href={PRICING_DOCUMENT_PATH} className="hover:text-accent">
            料金表
          </Link>
        </p>
      </footer>
    </div>
  );
}
