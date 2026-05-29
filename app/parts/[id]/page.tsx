import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { PartImage } from "@/components/PartImage";
import { PartInquiryChatPanel } from "@/components/PartInquiryChatPanel";
import { PartInquiryForm } from "@/components/PartInquiryForm";
import { PartSaleForm } from "@/components/PartSaleForm";
import { PartSellerInquiriesPanel } from "@/components/PartSellerInquiriesPanel";
import { partModelLabel } from "@/lib/part-catalog";
import { formatYen } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function PartDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  const supabase = await createClient();

  const { data: part } = await supabase
    .from("part_listings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!part) notFound();

  const { data: images } = await supabase
    .from("part_listing_images")
    .select("id, storage_path, sort_order")
    .eq("part_listing_id", id)
    .order("sort_order", { ascending: true });

  const isOwner = viewer?.id === part.seller_id;
  const canInquire = !!viewer && !isOwner && (part.status === "active" || part.status === "negotiating");

  const { data: buyerInquiry } =
    viewer && !isOwner
      ? await supabase
          .from("part_inquiries")
          .select("id, status, buyer_id, seller_id")
          .eq("part_listing_id", id)
          .eq("buyer_id", viewer.id)
          .maybeSingle()
      : { data: null };

  const { data: sellerInquiries } = isOwner
    ? await supabase
        .from("part_inquiries")
        .select("id, buyer_id, status, updated_at")
        .eq("part_listing_id", id)
        .order("updated_at", { ascending: false })
        .limit(20)
    : { data: null };

  const showBuyerChat =
    buyerInquiry && buyerInquiry.status === "open" && viewer?.id === buyerInquiry.buyer_id;

  return (
    <AuthenticatedShell>
      <div className="space-y-6">
        <Link href="/parts" className="text-sm text-muted hover:text-accent">
          ← パーツ一覧
        </Link>

        {images && images.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {images.map((img) => (
              <div key={img.id} className="relative aspect-square overflow-hidden rounded-lg border border-border">
                <PartImage path={img.storage_path} alt={part.part_name} fill className="rounded-lg" />
              </div>
            ))}
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted">
            {part.manufacturer} / {part.category}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{part.part_name}</h1>
          <p className="mt-2 text-sm text-muted">対応車種: {partModelLabel(part)}</p>
          {part.manufacturer_part_number ? (
            <p className="mt-1 font-mono text-sm text-muted">品番: {part.manufacturer_part_number}</p>
          ) : null}
          <p className="mt-2 text-sm text-muted">状態: {part.part_condition}</p>
          <p className="mt-2 text-sm text-muted">
            送料:{" "}
            {part.shipping_bearer === "buyer"
              ? "買い手負担"
              : part.shipping_bearer === "seller"
                ? "売り手負担"
                : "要相談"}
          </p>
          <p className="mt-3 text-xl font-semibold text-accent">
            {part.price_display_type === "ask"
              ? "ASK（価格はお問い合わせください）"
              : `${formatYen(part.price_ex_tax ?? 0)}（税抜）`}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{part.description || "説明なし"}</p>
          <p className="mt-3 text-xs text-muted">ステータス: {part.status}</p>
        </div>

        {!isOwner && viewer && showBuyerChat ? (
          <PartInquiryChatPanel
            inquiryId={buyerInquiry.id}
            partListingId={id}
            sellerId={part.seller_id}
            viewerId={viewer.id}
          />
        ) : null}

        {!isOwner && viewer && canInquire && !buyerInquiry ? (
          <PartInquiryForm partId={id} canInquire={canInquire} />
        ) : null}

        {!isOwner && buyerInquiry && buyerInquiry.status !== "open" ? (
          <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted">
            この問い合わせは終了しています。
          </div>
        ) : null}

        {!viewer && canInquire ? (
          <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted">
            問い合わせ・チャットにはログインが必要です。
          </div>
        ) : null}

        {isOwner && part.status !== "sold" && part.status !== "archived" ? (
          <PartSaleForm partId={id} />
        ) : null}

        {isOwner && viewer ? (
          <PartSellerInquiriesPanel
            inquiries={sellerInquiries ?? []}
            partListingId={id}
            sellerId={part.seller_id}
            viewerId={viewer.id}
          />
        ) : null}
      </div>
    </AuthenticatedShell>
  );
}
