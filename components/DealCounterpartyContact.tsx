type PartyContact = {
  store_name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
};

type Props = {
  role: "buyer" | "seller";
  buyer: PartyContact | null;
  seller: PartyContact | null;
};

function PartyBlock({
  title,
  party,
}: {
  title: string;
  party: PartyContact | null;
}) {
  if (!party) return null;
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <p className="text-xs font-medium text-muted">{title}</p>
      <dl className="mt-2 space-y-1 text-sm">
        <div>
          <dt className="inline text-muted">店舗: </dt>
          <dd className="inline">{party.store_name ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline text-muted">担当: </dt>
          <dd className="inline">{party.contact_name ?? "—"}</dd>
        </div>
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
      </dl>
    </div>
  );
}

export function DealCounterpartyContact({ role, buyer, seller }: Props) {
  const counterparty = role === "buyer" ? seller : buyer;
  const label = role === "buyer" ? "売り手" : "買い手";

  return (
    <section className="rounded-xl border border-accent/30 bg-accent/5 p-4">
      <h2 className="text-sm font-semibold text-accent">取引先連絡先（入金確認後）</h2>
      <p className="mt-1 text-xs text-muted">
        funded 到達後のみ、{label}の店舗名・担当者・電話を表示します。
      </p>
      <div className="mt-3">
        <PartyBlock title={label} party={counterparty} />
      </div>
    </section>
  );
}
