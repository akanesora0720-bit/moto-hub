import Link from "next/link";
import { DealBillingPanel } from "@/components/DealBillingPanel";
import { DealBoardPanel } from "@/components/DealBoardPanel";
import { DealCard } from "@/components/DealCard";
import { DealMilestonesPanel } from "@/components/DealMilestonesPanel";
import { DealTransferProofPanel } from "@/components/DealTransferProofPanel";
import type { DealTransferDocument } from "@/lib/deal-transfer-proof";
import { canFileDispute } from "@/lib/disputes";
import { notFound } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { AdminDealOpsPanel } from "@/components/AdminDealOpsPanel";
import type { AdminDealOpsInput } from "@/lib/admin-deal-ops";
import { DealActionPanel } from "@/components/DealActionPanel";
import { DealDetailFocus } from "@/components/DealDetailFocus";
import { DealPickupSchedulePanel } from "@/components/DealPickupSchedulePanel";
import { DealCounterpartyContact } from "@/components/DealCounterpartyContact";
import { canRevealDealContacts } from "@/lib/deal-contact";
import { canShowDealBoardForViewer } from "@/lib/deal-board";
import { DEAL_STATUS_LABELS, partyDealStatusBadge } from "@/lib/deal-flow";
import { formatYen } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { canAccessAdmin } from "@/lib/auth";
import { adminDealListPath } from "@/lib/admin-deal-routes";
import { getViewer } from "@/lib/viewer";
import { DealDetailTabs } from "@/components/DealDetailTabs";
import { DealDocumentsPanel } from "@/components/DealDocumentsPanel";
import { TransactionRecordPanel } from "@/components/TransactionRecordPanel";
import {
  canViewTransactionRecords,
  dealStatusMayHaveTransactionRecord,
} from "@/lib/transaction-record";
import type { Deal, DealStatus, InvoiceStatus, Profile, TransactionRecord } from "@/lib/types";

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return DealDetailPageView({ params });
}

export async function DealDetailPageView(
  { params }: { params: Promise<{ id: string }> },
  opts?: { forceAdminShell?: boolean },
) {
  const { id } = await params;
  const viewer = await getViewer();
  const supabase = await createClient();
  const userId = viewer!.id;
  const canAdminView = canAccessAdmin(viewer!.profile as Profile);
  const isAdmin = canAdminView;
  const useAdminShell = opts?.forceAdminShell === true;
  const dealsListHref = useAdminShell ? adminDealListPath() : "/deals";

  const { data: row } = await supabase
    .from("deals")
    .select(
      `
      *,
      listings ( maker, model, inspection_remaining, price_ex_tax )
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
  const isParty = row.buyer_id === userId || row.seller_id === userId;
  const adminViewOnly = isAdmin && !isParty;

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
    seller_intent_confirmed: row.seller_intent_confirmed ?? false,
    buyer_intent_confirmed: row.buyer_intent_confirmed ?? false,
    payment_due_at: row.payment_due_at ?? null,
    platform_fee_invoice_issued_at: row.platform_fee_invoice_issued_at ?? null,
    platform_fee_due_at: row.platform_fee_due_at ?? null,
    platform_fee_paid_at: row.platform_fee_paid_at ?? null,
    seller_payment_confirmed_at: row.seller_payment_confirmed_at ?? null,
    buyer_payment_reported_at: row.buyer_payment_reported_at ?? null,
    pickup_scheduled_at: row.pickup_scheduled_at ?? null,
    pickup_completed_at: row.pickup_completed_at ?? null,
    transfer_completed_at: row.transfer_completed_at ?? null,
    tracking_number: row.tracking_number ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    listing: {
      maker: listing?.maker ?? "—",
      model: listing?.model ?? "—",
      inspection_remaining: listing?.inspection_remaining ?? null,
    },
  };

  const boardVisible = canShowDealBoardForViewer(deal, { isAdmin });
  const boardRole: "buyer" | "seller" | "admin" = adminViewOnly
    ? "admin"
    : role;
  const showMilestones =
    deal.status !== "inquiry" && deal.status !== "negotiating" && deal.status !== "cancelled";
  const isPreAgreement = deal.status === "inquiry" || deal.status === "negotiating";
  const billingFirst =
    deal.status === "awaiting_payment" ||
    (deal.status === "funded" && role === "buyer");
  const { data: invoiceRows } = adminViewOnly
    ? await supabase
        .from("invoices")
        .select("id, party, status, document_kind")
        .eq("deal_id", id)
    : { data: null };

  type InvoiceRow = {
    id: string;
    party: string;
    status: InvoiceStatus;
    document_kind?: string | null;
  };
  const invoices = (invoiceRows ?? []) as InvoiceRow[];
  const paymentInstruction = invoices.find(
    (i) => i.party === "buyer" && i.document_kind === "payment_instruction",
  );
  const platformFeeInvoice = invoices.find(
    (i) => i.party === "seller" && i.document_kind === "platform_fee",
  );

  const { data: feeAccrual } = await supabase
    .from("platform_fee_accruals")
    .select("status, weekly_invoice_id")
    .eq("deal_id", id)
    .maybeSingle();

  let weeklyFeeInvoiceStatus: InvoiceStatus | null = null;
  if (feeAccrual?.weekly_invoice_id) {
    const { data: wInv } = await supabase
      .from("invoices")
      .select("status")
      .eq("id", feeAccrual.weekly_invoice_id)
      .maybeSingle();
    weeklyFeeInvoiceStatus = (wInv?.status as InvoiceStatus) ?? null;
  }

  const weeklyFeeInvoiceId = feeAccrual?.weekly_invoice_id ?? platformFeeInvoice?.id ?? null;

  const { data: transferDocRows } = showMilestones
    ? await supabase
        .from("deal_transfer_documents")
        .select(
          "id, deal_id, document_kind, storage_path, original_filename, mime_type, byte_size, uploaded_by, uploaded_at, seller_acknowledged_at, seller_acknowledged_by",
        )
        .eq("deal_id", id)
        .order("uploaded_at", { ascending: false })
    : { data: [] };

  const transferDocuments = (transferDocRows ?? []) as DealTransferDocument[];

  let transactionRecord: TransactionRecord | null = null;
  if (
    dealStatusMayHaveTransactionRecord(deal.status) &&
    (isParty || isAdmin) &&
    canViewTransactionRecords(viewer!.profile as Profile)
  ) {
    const { data: tr } = await supabase
      .from("transaction_records")
      .select("*")
      .eq("deal_id", id)
      .maybeSingle();
    transactionRecord = (tr as TransactionRecord | null) ?? null;
  }

  const recordRole: "seller" | "buyer" | "admin" = adminViewOnly
    ? "admin"
    : role === "seller"
      ? "seller"
      : "buyer";

  const adminOpsInput: AdminDealOpsInput | null = adminViewOnly
    ? {
        status: deal.status,
        agreedPriceExTax: deal.agreed_price_ex_tax,
        paymentInstructionStatus: paymentInstruction?.status ?? null,
        pickupCompletedAt: deal.pickup_completed_at,
        feeAccrualStatus: feeAccrual?.status ?? null,
        weeklyFeeInvoiceStatus,
        buyerPaymentReported: !!deal.buyer_payment_reported_at,
        sellerPaymentConfirmed: !!deal.seller_payment_confirmed_at,
        buyerConfirmed: !!deal.buyer_confirmed_at,
        sellerConfirmed: !!deal.seller_confirmed_at,
        requiresNameTransfer: deal.requires_name_transfer,
        transferCompletedAt: deal.transfer_completed_at,
        transferDeadlineAt: deal.transfer_deadline_at,
        transferOverdue: deal.transfer_overdue,
      }
    : null;

  const billingSection = (
    <DealCard id="deal-billing" title="請求・入金" step={3}>
      <DealBillingPanel
        dealId={id}
        userId={userId}
        role={role}
        status={deal.status}
        agreedPriceExTax={deal.agreed_price_ex_tax}
        paymentDueAt={deal.payment_due_at}
        platformFeeDueAt={deal.platform_fee_due_at}
        pickupCompletedAt={deal.pickup_completed_at}
      />
    </DealCard>
  );

  const focusPrimaryAction =
    !adminViewOnly &&
    (deal.status === "awaiting_payment" || deal.status === "funded");

  const actionSection = (
    <DealCard
      id="deal-primary-action"
      title="今やること・詳細"
      step={billingFirst ? 4 : 3}
      highlight={!adminViewOnly}
    >
      {adminViewOnly ? (
        <p className="text-sm text-muted">
          当事者の操作状況は下の連絡板・マイルストーンで確認できます。運営の取引完了・週次手数料確認は上の「運営の手順」から行ってください。
        </p>
      ) : (
        <DealActionPanel deal={deal} role={role} />
      )}
    </DealCard>
  );

  return (
    <AuthenticatedShell mode={useAdminShell ? "admin" : "dealer"}>
      <div className="mx-auto max-w-xl space-y-5">
        <DealDetailFocus enabled={focusPrimaryAction} />
        <Link href={dealsListHref} className="text-sm text-muted hover:text-accent">
          ← {useAdminShell ? "取引連絡一覧" : "取引一覧"}
        </Link>

        <DealDetailTabs
          showDocumentsTab={!isPreAgreement}
          documents={
            <DealCard title="書類" step={0}>
              <DealDocumentsPanel dealId={id} />
            </DealCard>
          }
          overview={
            <>
        <DealCard title="車両情報" step={1}>
          <p className="text-sm text-muted">{deal.listing.maker}</p>
          <p className="text-xl font-semibold">{deal.listing.model}</p>
          <p className="mt-2 text-sm">
            成約価格（税抜）:{" "}
            <span className="font-medium">{formatYen(deal.agreed_price_ex_tax)}</span>
          </p>
          {deal.listing.inspection_remaining ? (
            <p className="mt-1 text-xs text-muted">
              車検残: {deal.listing.inspection_remaining}
            </p>
          ) : null}
        </DealCard>

        <DealCard title="商談情報" step={2}>
          <p className="text-sm font-medium">
            {isParty ? partyDealStatusBadge(deal.status, role) : DEAL_STATUS_LABELS[deal.status]}
          </p>
          {isPreAgreement ? (
            <p className="mt-2 text-sm text-muted">
              {role === "buyer"
                ? "運営が商談・合意を進めます。合意後に入金・引取の手順が表示されます。"
                : "運営が商談・合意を進めます。合意後に買い手の入金確認・引渡しへ進みます。"}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">
              {role === "buyer"
                ? "合意済みです。売り手へ直接お振込みのうえ、入金確認後に引取・引渡しへ進みます。"
                : "合意済みです。買い手の入金確認後、引取・引渡しと取引連絡板が利用できます。"}
            </p>
          )}
        </DealCard>

        {!isPreAgreement ? (
          <>
            {adminViewOnly && adminOpsInput ? (
              <DealCard title="運営の手順（この画面で完結）" highlight>
                <AdminDealOpsPanel
                  dealId={id}
                  status={deal.status}
                  opsInput={adminOpsInput}
                  platformFeeInvoiceId={weeklyFeeInvoiceId}
                />
              </DealCard>
            ) : null}

            {billingFirst ? (
              <>
                {billingSection}
                {actionSection}
              </>
            ) : (
              <>
                {actionSection}
                {billingSection}
              </>
            )}

            {contactPayload?.revealed && contactPayload.buyer && contactPayload.seller ? (
              <DealCounterpartyContact
                role={role}
                buyer={contactPayload.buyer}
                seller={contactPayload.seller}
              />
            ) : null}

            {showMilestones ? (
              <>
                <DealCard id="deal-pickup" title="引取・引渡（車両・書類同時）" step={5}>
                  {adminViewOnly ? (
                    <DealPickupSchedulePanel
                      dealId={id}
                      role="buyer"
                      status={deal.status}
                      pickupScheduledAt={deal.pickup_scheduled_at}
                      fundedAt={deal.funded_at}
                      sellerPaymentConfirmedAt={deal.seller_payment_confirmed_at}
                      readOnly
                    />
                  ) : (
                    <>
                      <DealPickupSchedulePanel
                        dealId={id}
                        role={role}
                        status={deal.status}
                        pickupScheduledAt={deal.pickup_scheduled_at}
                        fundedAt={deal.funded_at}
                        sellerPaymentConfirmedAt={deal.seller_payment_confirmed_at}
                      />
                      <div className="mt-4 border-t border-border/60 pt-4">
                        <DealMilestonesPanel
                          deal={deal}
                          role={role}
                          section="pickup"
                          readOnly={adminViewOnly}
                        />
                      </div>
                    </>
                  )}
                </DealCard>

                <DealCard title="名変" step={6}>
                  <DealMilestonesPanel
                    deal={deal}
                    role={role}
                    section="transfer"
                    readOnly={adminViewOnly}
                  />
                  <div className="mt-4 border-t border-border/60 pt-4">
                    <DealTransferProofPanel
                      dealId={id}
                      status={deal.status}
                      requiresNameTransfer={deal.requires_name_transfer}
                      viewerRole={adminViewOnly ? "admin" : role}
                      readOnly={adminViewOnly}
                      documents={transferDocuments}
                    />
                  </div>
                </DealCard>
              </>
            ) : null}

            <DealCard title="完了" step={7}>
              <p className="text-sm text-muted">
                引取完了後、Moto-Hub手数料は週次請求（毎週月曜発行）で精算されます。
              </p>
              {deal.status === "completed" && deal.completed_at ? (
                <p className="mt-2 text-sm text-emerald-300">
                  完了日時: {new Date(deal.completed_at).toLocaleString("ja-JP")}
                </p>
              ) : null}
            </DealCard>

            <DealCard title="取引連絡板（引取・引渡し専用）" className="border-accent/25">
              <DealBoardPanel
                dealId={id}
                viewerId={userId}
                role={boardRole}
                boardVisible={boardVisible}
                readOnly={adminViewOnly}
              />
            </DealCard>
          </>
        ) : (
          <DealCard title="成約前">
            {adminViewOnly ? (
              <p className="text-sm text-muted">運営表示。合意後に連絡板が開きます。</p>
            ) : (
              <DealActionPanel deal={deal} role={role} />
            )}
          </DealCard>
        )}

        {transactionRecord ? (
          <TransactionRecordPanel record={transactionRecord} role={recordRole} />
        ) : null}

        <div className="space-y-2">
          <Link
            href={`/support/new?deal=${id}`}
            className="block rounded-lg border border-border px-4 py-3 text-sm hover:border-accent/40"
          >
            運営サポート（エスカレーション）
          </Link>

          {canFileDispute(deal.status) && isParty ? (
            <Link
              href={`/disputes/new?deal=${id}`}
              className="block rounded-lg border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-100 hover:border-amber-500/50"
            >
              トラブル申告（dispute）
            </Link>
          ) : null}
        </div>
            </>
          }
        />
      </div>
    </AuthenticatedShell>
  );
}
