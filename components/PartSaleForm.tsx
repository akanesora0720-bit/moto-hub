"use client";

import { useState } from "react";
import { ActionButton, AsyncMessage, AsyncStatusBanner } from "@/components/ui/async-ui";
import { useAsyncAction } from "@/lib/use-async-action";

export function PartSaleForm({ partId }: { partId: string }) {
  const [buyerId, setBuyerId] = useState("");
  const [agreedPrice, setAgreedPrice] = useState("");
  const [shippingBearer, setShippingBearer] = useState("consult");
  const { loading, success, message, run } = useAsyncAction();

  const submit = async () => {
    await run(async () => {
      const res = await fetch(`/api/parts/${partId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyer_id: buyerId,
          agreed_price_ex_tax: Number(agreedPrice || 0),
          shipping_bearer: shippingBearer,
        }),
      });
      const data = (await res.json()) as { error?: string; seller_fee_ex_tax?: number };
      if (!res.ok) return { error: data.error ?? "成約登録に失敗しました。" };
      return { okMessage: `成約登録しました。売主手数料(税抜): ${data.seller_fee_ex_tax ?? 0}円` };
    });
  };

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-5">
      <h3 className="text-lg font-semibold text-amber-100">成約登録（売主）</h3>
      <p className="mt-1 text-sm text-amber-200/90">買い手IDと成約価格を入力して成約を確定します。入金指示書は自動発行されます。</p>
      <div className="mt-3 space-y-3">
        <AsyncStatusBanner loading={loading} />
        <input className="w-full rounded border border-border bg-zinc-950 px-3 py-2" placeholder="buyer_id (UUID)" value={buyerId} onChange={(e) => setBuyerId(e.target.value)} />
        <input className="w-full rounded border border-border bg-zinc-950 px-3 py-2" placeholder="成約価格(税抜)" value={agreedPrice} onChange={(e) => setAgreedPrice(e.target.value)} />
        <select className="w-full rounded border border-border bg-zinc-950 px-3 py-2" value={shippingBearer} onChange={(e) => setShippingBearer(e.target.value)}>
          <option value="buyer">送料: 買い手負担</option>
          <option value="seller">送料: 売り手負担</option>
          <option value="consult">送料: 要相談</option>
        </select>
        <AsyncMessage message={message} success={success} />
        <ActionButton loading={loading} success={success} onClick={submit} disabled={!buyerId || Number(agreedPrice || 0) <= 0} loadingLabel="成約登録中…" successLabel="成約済み">
          成約登録する
        </ActionButton>
      </div>
    </div>
  );
}
