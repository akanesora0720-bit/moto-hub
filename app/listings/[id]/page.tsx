import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { InspectionBadge } from "@/components/InspectionBadge";
import { InquiryForm } from "@/components/InquiryForm";
import { MileageRollbackBadge } from "@/components/MileageRollbackBadge";
import { SellerPublicSummary } from "@/components/SellerPublicSummary";
import { EngineVideoSection } from "@/components/EngineVideoSection";
import { ListingGradingDisplay } from "@/components/ListingGradingDisplay";
import { ListingImage } from "@/components/ListingImage";
import { parseGradesFromListing } from "@/lib/listing-grades";
import { formatKm, formatYear, formatYen } from "@/lib/format";
import { LISTING_SELLER_PUBLIC_SELECT, normalizeSellerPublicRow } from "@/lib/seller-public";
import { createClient } from "@/lib/supabase/server";
import type { MileageRollbackStatus } from "@/lib/types";
import { MILEAGE_ROLLBACK_OPTIONS, VEHICLE_CLASS_LABELS } from "@/lib/constants";
import type { VehicleClass } from "@/lib/constants";

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user!.id)
    .single();

  const { data: listing } = await supabase
    .from("listings")
    .select(
      `
      *,
      ${LISTING_SELLER_PUBLIC_SELECT},
      listing_images ( id, storage_path, sort_order )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (!listing || listing.status === "removed") notFound();

  const images = [...(listing.listing_images ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const sellerPublic = normalizeSellerPublicRow(
    listing.profiles_public as Parameters<typeof normalizeSellerPublicRow>[0],
  );
  const title = `${listing.maker} ${listing.model}`;
  const isOwner = listing.seller_id === user!.id;
  const grades = parseGradesFromListing(listing);

  return (
    <AppShell isAdmin={me?.is_admin}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/" className="text-sm text-muted hover:text-accent">
            ← 在庫一覧
          </Link>
          {isOwner && listing.status === "active" ? (
            <Link
              href={`/listings/${listing.id}/edit`}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-accent hover:border-accent/50"
            >
              出品を編集
            </Link>
          ) : null}
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-3">
            {images.length > 0 ? (
              images.map((img) => (
                <div key={img.id} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-zinc-900">
                  <ListingImage path={img.storage_path} alt={title} fill />
                </div>
              ))
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-zinc-900 text-muted">
                写真なし
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div>
              <p className="text-sm text-muted">{listing.maker}</p>
              <h1 className="text-3xl font-semibold">{listing.model}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                {listing.inspection_status ? <InspectionBadge /> : null}
              </div>
              <p className="mt-2 text-2xl font-semibold text-accent">
                {formatYen(listing.price_ex_tax)}
                <span className="ml-2 text-sm font-normal text-muted">税抜</span>
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-border bg-card p-3">
                <dt className="text-muted">年式</dt>
                <dd className="mt-1 font-medium">{formatYear(listing.year)}</dd>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <dt className="text-muted">車種区分</dt>
                <dd className="mt-1 font-medium">
                  {listing.vehicle_class
                    ? VEHICLE_CLASS_LABELS[listing.vehicle_class as VehicleClass]
                    : "—"}
                </dd>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <dt className="text-muted">走行</dt>
                <dd className="mt-1 font-medium">{formatKm(listing.mileage)}</dd>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <dt className="text-muted">距離減算</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  <MileageRollbackBadge
                    status={(listing.mileage_rollback ?? "none") as MileageRollbackStatus}
                  />
                  <span className="text-sm">
                    {
                      MILEAGE_ROLLBACK_OPTIONS.find(
                        (o) => o.value === (listing.mileage_rollback ?? "none"),
                      )?.label
                    }
                  </span>
                </dd>
              </div>
              <div className="col-span-2 rounded-lg border border-border bg-card p-3">
                <dt className="text-muted">車台番号</dt>
                <dd className="mt-1 break-all font-mono text-sm tracking-wide">
                  {listing.frame_number}
                </dd>
              </div>
            </dl>

            <ListingGradingDisplay
              grades={grades}
              inspectionRemaining={listing.inspection_remaining}
            />

            {listing.engine_video_url ? (
              <EngineVideoSection url={listing.engine_video_url} />
            ) : null}

            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold">状態</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                {listing.condition_comment}
              </p>
            </div>

            {!isOwner && sellerPublic ? (
              <SellerPublicSummary
                seller={sellerPublic}
                memberHref={`/members/${sellerPublic.id}`}
              />
            ) : null}

            {!isOwner ? (
              <div id="inquiry" className="scroll-mt-6">
                <InquiryForm listingId={listing.id} sellerId={listing.seller_id} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
