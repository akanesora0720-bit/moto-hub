import { formatBankAccount } from "@/lib/billing";
import type { DealPartyContact } from "@/lib/deal-contact";

type Props = {
  role: "buyer" | "seller";
  buyer: DealPartyContact | null;
  seller: DealPartyContact | null;
};

function PartyBlock({
  title,
  party,
  showBank,
  showDirectContact = false,
}: {
  title: string;
  party: DealPartyContact | null;
  showBank?: boolean;
  /** 電話・メールは緊急開示のみ。通常は振込先等のみ */
  showDirectContact?: boolean;
}) {
  if (!party) return null;
  const bankLine = showBank ? formatBankAccount(party) : null;

  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <p className="text-xs font-medium text-muted">{title}</p>
      <dl className="mt-2 space-y-1 text-sm">
        <div>
          <dt className="inline text-muted">会社名: </dt>
          <dd className="inline">{party.store_name ?? "—"}</dd>
        </div>
        {party.trade_name ? (
          <div>
            <dt className="inline text-muted">屋号: </dt>
            <dd className="inline">{party.trade_name}</dd>
          </div>
        ) : null}
        {party.invoice_number ? (
          <div>
            <dt className="inline text-muted">インボイス: </dt>
            <dd className="inline">{party.invoice_number}</dd>
          </div>
        ) : null}
        <div>
          <dt className="inline text-muted">担当: </dt>
          <dd className="inline">{party.contact_name ?? "—"}</dd>
        </div>
        {showDirectContact ? (
          <div>
            <dt className="inline text-muted">電話: </dt>
            <dd className="inline">
              {party.phone ? (
                <a href={`tel:${party.phone}`} className="text-accent hover:underline">
                  {party.phone}
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
        ) : (
          <p className="text-xs text-muted">
            電話・メールは非公開です。引取当日の緊急時は取引連絡板の「緊急連絡先を表示」をご利用ください。
          </p>
        )}
        {bankLine ? (
          <div>
            <dt className="block text-muted">振込先</dt>
            <dd className="mt-0.5 font-medium text-accent">{bankLine}</dd>
          </div>
        ) : showBank ? (
          <p className="text-xs text-amber-200/90">振込口座が未登録です。売り手にご確認ください。</p>
        ) : null}
      </dl>
    </div>
  );
}

export function DealCounterpartyContact({ role, buyer, seller }: Props) {
  const counterparty = role === "buyer" ? seller : buyer;
  const label = role === "buyer" ? "売り手（お振込先）" : "買い手";

  return (
    <section className="rounded-xl border border-accent/30 bg-accent/5 p-4">
      <h2 className="text-sm font-semibold text-accent">取引先情報</h2>
      <p className="mt-1 text-xs text-muted">
        振込先など取引に必要な情報を表示します。電話番号は緊急時のみ取引連絡板から開示されます。
      </p>
      <div className="mt-3">
        <PartyBlock title={label} party={counterparty} showBank={role === "buyer"} />
      </div>
    </section>
  );
}
