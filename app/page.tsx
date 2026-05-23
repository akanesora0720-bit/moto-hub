import Link from "next/link";
import { Suspense } from "react";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { ListingCard } from "@/components/ListingCard";
import { ListingSearchForm } from "@/components/ListingSearchForm";
import { mapListingRows } from "@/lib/listings";
import { fetchActiveListings } from "@/lib/listings-query";
import {
  LISTINGS_PAGE_SIZE,
  listingSearchHref,
  parseListingSearch,
  type ListingSearchQuery,
} from "@/lib/listing-search";
import { createClient } from "@/lib/supabase/server";

function SearchFormFallback() {
  return (
    <div className="h-32 animate-pulse rounded-xl border border-border bg-card" />
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<ListingSearchQuery>;
}) {
  const sp = await searchParams;
  const search = parseListingSearch(sp);
  const supabase = await createClient();
  const { data: rows, error, count } = await fetchActiveListings(supabase, search);

  const listings = mapListingRows((rows ?? []) as Parameters<typeof mapListingRows>[0]);
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LISTINGS_PAGE_SIZE));
  const hasFilters = !!(
    search.maker ||
    search.vehicleClass ||
    search.model ||
    search.frameNumber
  );

  return (
    <AuthenticatedShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">在庫一覧</h1>
          <p className="mt-1 text-sm text-muted">
            メーカー・車種区分・車名・車台番号で絞り込み。業販価格（税抜）・仲介手数料は成約時に売買各5%。
          </p>
        </div>

        <Suspense fallback={<SearchFormFallback />}>
          <ListingSearchForm />
        </Suspense>

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

        {listings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center text-muted">
            {hasFilters
              ? "条件に合う在庫がありません。条件を変えて検索してください。"
              : "出品がありません。最初の一台を出品してみましょう。"}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} showInquiryLink />
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <nav className="flex flex-wrap items-center justify-center gap-2 text-sm">
            {search.page > 1 ? (
              <Link
                href={listingSearchHref({ ...search, page: search.page - 1 })}
                className="rounded-lg border border-border px-3 py-1.5 hover:border-accent/50"
              >
                ← 前へ
              </Link>
            ) : null}
            {search.page < totalPages ? (
              <Link
                href={listingSearchHref({ ...search, page: search.page + 1 })}
                className="rounded-lg border border-border px-3 py-1.5 hover:border-accent/50"
              >
                次へ →
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    </AuthenticatedShell>
  );
}
