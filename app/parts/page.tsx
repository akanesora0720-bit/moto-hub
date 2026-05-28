import Link from "next/link";
import { Suspense } from "react";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { PartSearchForm } from "@/components/PartSearchForm";
import { fetchPartCatalog, partModelLabel } from "@/lib/part-catalog";
import { formatYen } from "@/lib/format";
import {
  fetchPartListings,
  partSearchHasFilters,
  partSearchHref,
  parsePartSearch,
  PARTS_PAGE_SIZE,
} from "@/lib/part-search";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function SearchFormFallback() {
  return <div className="h-40 animate-pulse rounded-xl border border-border bg-card" />;
}

export default async function PartsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const search = parsePartSearch({
    manufacturer_id: typeof sp.manufacturer_id === "string" ? sp.manufacturer_id : undefined,
    category_id: typeof sp.category_id === "string" ? sp.category_id : undefined,
    model: typeof sp.model === "string" ? sp.model : undefined,
    keyword: typeof sp.keyword === "string" ? sp.keyword : undefined,
    mpn: typeof sp.mpn === "string" ? sp.mpn : undefined,
    exclude_ask: typeof sp.exclude_ask === "string" ? sp.exclude_ask : undefined,
    price_min: typeof sp.price_min === "string" ? sp.price_min : undefined,
    price_max: typeof sp.price_max === "string" ? sp.price_max : undefined,
    page: typeof sp.page === "string" ? sp.page : undefined,
  });

  const supabase = await createClient();
  const { manufacturers, categories, error: catalogError } = await fetchPartCatalog(supabase);
  const { data: rows, error, count } = await fetchPartListings(supabase, search);

  const parts = rows ?? [];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PARTS_PAGE_SIZE));
  const hasFilters = partSearchHasFilters(search);

  return (
    <AuthenticatedShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">パーツ売買</h1>
            <p className="mt-1 text-sm text-muted">
              メーカー・車種・カテゴリ・品番で検索。車種は入力のたびにマスタが育ちます。
            </p>
          </div>
          <Link
            href="/parts/new"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black"
          >
            新規出品
          </Link>
        </div>

        {catalogError ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            カタログの読み込みに失敗しました。マイグレーション 074 の適用を確認してください。
          </p>
        ) : (
          <Suspense fallback={<SearchFormFallback />}>
            <PartSearchForm manufacturers={manufacturers} categories={categories} />
          </Suspense>
        )}

        <p className="text-sm text-muted">
          {hasFilters ? "検索結果: " : ""}
          <span className="tabular-nums text-foreground">{total}</span> 件
          {totalPages > 1 ? (
            <span className="ml-2">
              （{search.page} / {totalPages} ページ）
            </span>
          ) : null}
        </p>

        {error ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            読み込みエラー: {error.message}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {parts.length === 0 ? (
            <p className="text-sm text-muted sm:col-span-2 lg:col-span-3">
              {hasFilters
                ? "条件に合うパーツがありません。条件を変えて検索してください。"
                : "パーツ出品はまだありません。"}
            </p>
          ) : null}
          {parts.map((p) => (
            <Link
              key={p.id}
              href={`/parts/${p.id}`}
              className="rounded-xl border border-border bg-card p-4 hover:border-accent/40"
            >
              <p className="text-xs text-muted">
                {p.manufacturer} / {p.category}
              </p>
              <h2 className="mt-1 font-semibold">{p.part_name}</h2>
              <p className="mt-1 line-clamp-1 font-mono text-xs text-muted">
                {p.manufacturer_part_number
                  ? `品番: ${p.manufacturer_part_number}`
                  : "品番: —"}
              </p>
              <p className="mt-2 line-clamp-1 text-sm text-muted">
                対応: {partModelLabel(p)}
              </p>
              <p className="mt-2 text-sm text-muted">
                送料:{" "}
                {p.shipping_bearer === "buyer"
                  ? "買い手負担"
                  : p.shipping_bearer === "seller"
                    ? "売り手負担"
                    : "要相談"}
              </p>
              <p className="mt-2 text-lg font-semibold text-accent">
                {p.price_display_type === "ask" ? "ASK" : formatYen(p.price_ex_tax ?? 0)}
                <span className="ml-2 text-xs text-muted">{p.status}</span>
              </p>
            </Link>
          ))}
        </div>

        {totalPages > 1 ? (
          <div className="flex justify-center gap-3 text-sm">
            {search.page > 1 ? (
              <Link
                href={partSearchHref({ ...search, page: search.page - 1 })}
                className="rounded border border-border px-3 py-1 hover:border-accent/40"
              >
                ← 前へ
              </Link>
            ) : null}
            {search.page < totalPages ? (
              <Link
                href={partSearchHref({ ...search, page: search.page + 1 })}
                className="rounded border border-border px-3 py-1 hover:border-accent/40"
              >
                次へ →
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </AuthenticatedShell>
  );
}
