import Link from "next/link";
import { MotohubInspectionBadge } from "@/components/MotohubInspectionBadge";
import { isMotohubInspected } from "@/lib/inspection";
import { ListingImage } from "@/components/ListingImage";
import { MileageRollbackBadge } from "@/components/MileageRollbackBadge";
import { TrustBadge } from "@/components/TrustBadge";
import { VerificationBadge } from "@/components/VerificationBadge";
import { VEHICLE_CLASS_LABELS } from "@/lib/constants";
import type { VehicleClass } from "@/lib/constants";
import { formatYear, formatYen } from "@/lib/format";
import { formatGradesCompact, parseGradesFromListing } from "@/lib/listing-grades";
import { isListingInquirable } from "@/lib/listing-status";
import type { ListingCard as ListingCardType } from "@/lib/types";

export function ListingCard({
  listing,
  editHref,
  showInquiryLink = false,
}: {
  listing: ListingCardType;
  editHref?: string;
  /** 在庫一覧など: 詳細・問い合わせへの導線 */
  showInquiryLink?: boolean;
}) {
  const title = `${listing.maker} ${listing.model}`;
  const grades = parseGradesFromListing(listing);
  const subGrades = formatGradesCompact(grades);

  return (
    <div className="group overflow-hidden rounded-xl border border-border bg-card transition hover:border-accent/40">
      <Link href={`/listings/${listing.id}`} className="block">
      <div className="relative aspect-[4/3] bg-zinc-900">
        <ListingImage path={listing.cover_path} alt={title} fill className="transition group-hover:scale-[1.02]" />
        {isMotohubInspected(listing.inspection_badge_type) ? (
          <div className="absolute left-2 top-2">
            <MotohubInspectionBadge />
          </div>
        ) : null}
        {listing.status === "negotiating" ? (
          <div className="absolute right-2 top-2">
            <span className="rounded border border-amber-500/50 bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
              商談中
            </span>
          </div>
        ) : null}
      </div>
      <div className="space-y-2 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="line-clamp-2 text-sm font-semibold leading-snug">{title}</h2>
          <TrustBadge
            rank={listing.seller_trust_rank}
            score={listing.seller_trust_score}
            compact
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <MileageRollbackBadge status={listing.mileage_rollback} />
          <VerificationBadge status={listing.seller_verification_status} />
        </div>
        {listing.grade_total != null ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-accent/30 bg-accent/10 px-2 py-0.5 font-serif text-sm font-semibold text-accent">
              総合 {listing.grade_total}
            </span>
            {subGrades ? <span className="text-[10px] text-zinc-500">{subGrades}</span> : null}
          </div>
        ) : null}
        {listing.inspection_remaining ? (
          <p className="text-xs text-muted">車検残: {listing.inspection_remaining}</p>
        ) : null}
        {listing.engine_video_url ? (
          <span className="inline-flex rounded border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-200">
            動画あり
          </span>
        ) : null}
        <p className="font-mono text-[10px] text-zinc-500">{listing.frame_number}</p>
        <p className="text-lg font-semibold text-accent">{formatYen(listing.price_ex_tax)}</p>
        <p className="text-xs text-muted">
          {listing.vehicle_class
            ? `${VEHICLE_CLASS_LABELS[listing.vehicle_class as VehicleClass]} · `
            : ""}
          {formatYear(listing.year)} · {listing.seller_prefecture ?? "—"}
        </p>
      </div>
      </Link>
      {editHref ? (
        <div className="border-t border-border px-4 py-2.5">
          <Link
            href={editHref}
            className="text-sm font-medium text-accent hover:underline"
          >
            編集
          </Link>
        </div>
      ) : showInquiryLink && isListingInquirable(listing.status) ? (
        <div className="flex border-t border-border text-sm">
          <Link
            href={`/listings/${listing.id}`}
            className="flex-1 px-4 py-2.5 text-center text-muted hover:bg-zinc-900/50 hover:text-foreground"
          >
            詳細
          </Link>
          <Link
            href={`/listings/${listing.id}#inquiry`}
            className="flex-1 border-l border-border px-4 py-2.5 text-center font-medium text-accent hover:bg-accent/10"
          >
            問い合わせ
          </Link>
        </div>
      ) : showInquiryLink ? (
        <div className="border-t border-border px-4 py-2.5 text-center text-xs text-muted">
          {listing.status === "negotiating" ? "商談中" : "問い合わせ不可"}
        </div>
      ) : null}
    </div>
  );
}
