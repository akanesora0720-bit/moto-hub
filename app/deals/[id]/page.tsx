import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { DealActionPanel } from "@/components/DealActionPanel";
import { DealCounterpartyContact } from "@/components/DealCounterpartyContact";
import { canRevealDealContacts } from "@/lib/deal-contact";
import { DEAL_STATUS_LABELS } from "@/lib/deal-flow";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import type { Deal, DealStatus } from "@/lib/types";

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await getViewer();
  const supabase = await createClient();
  const userId = viewer!.id;
  const isAdmin = viewer!.profile.is_admin;

  const { data: row } = await supabase
    .from("deals")
    .select(
      `
      *,
      listings ( maker, model, inspection_remaining )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (!row) notFound();
  if (row.buyer_id !== userId && row.seller_id !== userId && !isAdmin) {
    notFound();
  }

  const listing = Array.isArray(row.listings) ? row.listings[0] : row.listings;
  const role =
    row.buyer_id === userId ? "buyer" : row.seller_id === userId ? "seller" : "buyer";

  type PartyContact = {
    store_name: string | null;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
  };
  type DealContactsPayload = {
    revealed: boolean;
    buyer?: PartyContact;
    seller?: PartyContact;
  };

  let contactPayload: DealContactsPayload | null = null;

  if (canRevealDealContacts(row.status as DealStatus)) {
    const { data: contacts } = await supabase.rpc("get_deal_party_contacts", {
      p_deal_id: id,
    });
    contactPayload = contacts as DealContactsPayload | null;
  }

  const deal: Deal & {
    listing: { maker: string; model: string; inspection_remaining: string | null };
  } = {
    id: row.id,
    listing_id: row.listing_id,
    buyer_id: row.buyer_id,
    seller_id: row.seller_id,
    agreed_price_ex_tax: row.agreed_price_ex_tax,
    status: row.status as DealStatus,
    seller_fee_rate: row.seller_fee_rate,
    buyer_fee_rate: row.buyer_fee_rate,
    inquiry_id: row.inquiry_id ?? null,
    handover_at: row.handover_at ?? null,
    funded_at: row.funded_at ?? null,
    transfer_deadline_at: row.transfer_deadline_at ?? null,
    requires_name_transfer: row.requires_name_transfer ?? false,
    buyer_confirmed_at: row.buyer_confirmed_at ?? null,
    seller_confirmed_at: row.seller_confirmed_at ?? null,
    payout_at: row.payout_at ?? null,
    transfer_overdue: row.transfer_overdue ?? false,
    completed_at: row.completed_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    listing: {
      maker: listing?.maker ?? "—",
      model: listing?.model ?? "—",
      inspection_remaining: listing?.inspection_remaining ?? null,
    },
  };

  return (
    <AuthenticatedShell>
      <div className="mx-auto max-w-xl space-y-6">
        <Link href="/deals" className="text-sm text-muted hover:text-accent">
          ← 取引一覧
        </Link>

        <div>
          <p className="text-sm text-muted">{deal.listing.maker}</p>
          <h1 className="text-2xl font-semibold">
            {deal.listing.model}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {DEAL_STATUS_LABELS[deal.status]}
            {isAdmin ? (
              <>
                {" "}
                ·{" "}
                <Link href="/admin" className="text-accent hover:underline">
                  管理画面で操作
                </Link>
              </>
            ) : null}
          </p>
        </div>

        {isAdmin && row.buyer_id !== userId && row.seller_id !== userId ? (
          <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted">
            管理者表示。ステータス変更は管理画面の取引タブから行ってください。
          </p>
        ) : (
          <DealActionPanel deal={deal} role={role} />
        )}

        {contactPayload?.revealed && contactPayload.buyer && contactPayload.seller ? (
          <DealCounterpartyContact
            role={role}
            buyer={contactPayload.buyer}
            seller={contactPayload.seller}
          />
        ) : null}

        <div className="rounded-xl border border-border bg-zinc-950/50 p-4 text-xs leading-relaxed text-zinc-500">
          <p className="font-medium text-zinc-400">取引の流れ</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>問い合わせ・商談・合意（運営）</li>
            <li>買い手入金 → 運営が入金確認</li>
            <li>売り手が車両と書類を同時に引渡</li>
            <li>車検残ありの場合は翌週金曜まで名義変更</li>
            <li>双方が取引完了を確認</li>
            <li>運営が売り手へ振込 → 完了</li>
          </ol>
        </div>
      </div>
    </AuthenticatedShell>
  );
}
