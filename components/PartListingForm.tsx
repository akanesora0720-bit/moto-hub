"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionButton, AsyncMessage, AsyncStatusBanner } from "@/components/ui/async-ui";
import { useAsyncAction } from "@/lib/use-async-action";

export function PartListingForm() {
  const router = useRouter();
  const { loading, success, message, run } = useAsyncAction();
  const [form, setForm] = useState({
    part_name: "",
    manufacturer: "",
    compatible_models: "",
    category: "",
    part_condition: "中古",
    description: "",
    price_display_type: "fixed",
    price_ex_tax: "",
    shipping_bearer: "buyer",
  });

  const submit = async () => {
    await run(async () => {
      const payload = {
        ...form,
        price_ex_tax:
          form.price_display_type === "fixed"
            ? Number(form.price_ex_tax || 0)
            : null,
      };

      const res = await fetch("/api/parts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string; id?: string };
      if (!res.ok) {
        return { error: data.error ?? "パーツ出品に失敗しました。" };
      }
      if (data.id) {
        router.push(`/parts/${data.id}`);
        router.refresh();
      }
      return { okMessage: "パーツを出品しました。" };
    });
  };

  const invalid =
    !form.part_name.trim() ||
    !form.manufacturer.trim() ||
    !form.category.trim() ||
    (form.price_display_type === "fixed" && Number(form.price_ex_tax || 0) <= 0);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">パーツ出品</h2>
      <AsyncStatusBanner loading={loading} />
      <div className="grid gap-3 md:grid-cols-2">
        <input className="rounded border border-border bg-zinc-950 px-3 py-2" placeholder="パーツ名" value={form.part_name} onChange={(e) => setForm((v) => ({ ...v, part_name: e.target.value }))} />
        <input className="rounded border border-border bg-zinc-950 px-3 py-2" placeholder="メーカー" value={form.manufacturer} onChange={(e) => setForm((v) => ({ ...v, manufacturer: e.target.value }))} />
        <input className="rounded border border-border bg-zinc-950 px-3 py-2" placeholder="対応車種" value={form.compatible_models} onChange={(e) => setForm((v) => ({ ...v, compatible_models: e.target.value }))} />
        <input className="rounded border border-border bg-zinc-950 px-3 py-2" placeholder="カテゴリ（例: エンジン）" value={form.category} onChange={(e) => setForm((v) => ({ ...v, category: e.target.value }))} />
        <input className="rounded border border-border bg-zinc-950 px-3 py-2" placeholder="状態（例: 中古A）" value={form.part_condition} onChange={(e) => setForm((v) => ({ ...v, part_condition: e.target.value }))} />
        <select className="rounded border border-border bg-zinc-950 px-3 py-2" value={form.shipping_bearer} onChange={(e) => setForm((v) => ({ ...v, shipping_bearer: e.target.value }))}>
          <option value="buyer">送料: 買い手負担</option>
          <option value="seller">送料: 売り手負担</option>
          <option value="consult">送料: 要相談</option>
        </select>
      </div>
      <textarea className="w-full rounded border border-border bg-zinc-950 px-3 py-2" rows={4} placeholder="説明文" value={form.description} onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))} />
      <div className="grid gap-3 md:grid-cols-2">
        <select className="rounded border border-border bg-zinc-950 px-3 py-2" value={form.price_display_type} onChange={(e) => setForm((v) => ({ ...v, price_display_type: e.target.value }))}>
          <option value="fixed">価格表示: fixed</option>
          <option value="ask">価格表示: ask</option>
        </select>
        <input disabled={form.price_display_type === "ask"} className="rounded border border-border bg-zinc-950 px-3 py-2 disabled:opacity-50" placeholder="価格(税抜)" value={form.price_ex_tax} onChange={(e) => setForm((v) => ({ ...v, price_ex_tax: e.target.value }))} />
      </div>
      <AsyncMessage message={message} success={success} />
      <ActionButton onClick={submit} loading={loading} success={success} disabled={invalid} loadingLabel="出品中…" successLabel="出品済み">
        出品する
      </ActionButton>
    </div>
  );
}
