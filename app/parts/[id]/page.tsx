import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { PartInquiryForm } from "@/components/PartInquiryForm";
import { PartSaleForm } from "@/components/PartSaleForm";
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

  const isOwner = viewer?.id === part.seller_id;
  const canInquire = !isOwner && (part.status === "active" || part.status === "negotiating");

  const { data: inquiries } = isOwner
    ? await supabase
        .from("part_inquiries")
        .select("id, buyer_id, status, updated_at")
        .eq("part_listing_id", id)
        .order("updated_at", { ascending: false })
        .limit(20)
    : { data: null };

  return (
    <AuthenticatedShell>
      <div className="space-y-6">
        <Link href="/parts" className="text-sm text-muted hover:text-accent">← パーツ一覧</Link>

        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted">{part.manufacturer} / {part.category}</p>
          <h1 className="mt-1 text-2xl font-semibold">{part.part_name}</h1>
          <p className="mt-2 text-sm text-muted">対応車種: {partModelLabel(part)}</p>
          {part.manufacturer_part_number ? (
            <p className="mt-1 font-mono text-sm text-muted">
              品番: {part.manufacturer_part_number}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-muted">状態: {part.part_condition}</p>
          <p className="mt-2 text-sm text-muted">送料: {part.shipping_bearer === "buyer" ? "買い手負担" : part.shipping_bearer === "seller" ? "売り手負担" : "要相談"}</p>
          <p className="mt-3 text-xl font-semibold text-accent">
            {part.price_display_type === "ask" ? "ASK（価格はお問い合わせください）" : `${formatYen(part.price_ex_tax ?? 0)}（税抜）`}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{part.description || "説明なし"}</p>
          <p className="mt-3 text-xs text-muted">ステータス: {part.status}</p>
        </div>

        {!isOwner ? <PartInquiryForm partId={id} canInquire={canInquire} /> : null}

        {isOwner && part.status !== "sold" && part.status !== "archived" ? (
          <PartSaleForm partId={id} />
        ) : null}

        {isOwner ? (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold">問い合わせ一覧（買い手ID）</h3>
            <div className="mt-3 space-y-2 text-sm">
              {(inquiries ?? []).length === 0 ? <p className="text-muted">問い合わせはまだありません。</p> : null}
              {(inquiries ?? []).map((inq) => (
                <div key={inq.id} className="rounded border border-border px-3 py-2">
                  <p>buyer_id: {inq.buyer_id}</p>
                  <p className="text-xs text-muted">status: {inq.status} / 更新: {new Date(inq.updated_at).toLocaleString("ja-JP")}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </AuthenticatedShell>
  );
}
