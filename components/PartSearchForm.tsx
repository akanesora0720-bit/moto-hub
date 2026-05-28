"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { MobilePicker } from "@/components/MobilePicker";
import type { PartCategory, PartManufacturer } from "@/lib/part-catalog";
import { normalizePartCatalogText } from "@/lib/part-normalize";
import { parsePartSearch } from "@/lib/part-search";

export function PartSearchForm({
  manufacturers,
  categories,
}: {
  manufacturers: PartManufacturer[];
  categories: PartCategory[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsed = parsePartSearch({
    manufacturer_id: searchParams.get("manufacturer_id") ?? undefined,
    category_id: searchParams.get("category_id") ?? undefined,
    model: searchParams.get("model") ?? undefined,
    keyword: searchParams.get("keyword") ?? undefined,
    mpn: searchParams.get("mpn") ?? undefined,
    exclude_ask: searchParams.get("exclude_ask") ?? undefined,
    price_min: searchParams.get("price_min") ?? undefined,
    price_max: searchParams.get("price_max") ?? undefined,
  });

  const [manufacturerId, setManufacturerId] = useState(parsed.manufacturerId ?? "");
  const [categoryId, setCategoryId] = useState(parsed.categoryId ?? "");
  const [model, setModel] = useState(parsed.model ?? "");
  const [keyword, setKeyword] = useState(parsed.keyword ?? "");
  const [mpn, setMpn] = useState(parsed.mpn ?? "");
  const [excludeAsk, setExcludeAsk] = useState(parsed.excludeAsk);
  const [priceMin, setPriceMin] = useState(parsed.priceMin ? String(parsed.priceMin) : "");
  const [priceMax, setPriceMax] = useState(parsed.priceMax ? String(parsed.priceMax) : "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const sp = new URLSearchParams();
    if (manufacturerId) sp.set("manufacturer_id", manufacturerId);
    if (categoryId) sp.set("category_id", categoryId);
    if (model.trim()) sp.set("model", normalizePartCatalogText(model.trim()));
    if (keyword.trim()) sp.set("keyword", keyword.trim());
    if (mpn.trim()) sp.set("mpn", normalizePartCatalogText(mpn.trim()));
    if (excludeAsk) sp.set("exclude_ask", "1");
    if (priceMin.trim()) sp.set("price_min", priceMin.trim());
    if (priceMax.trim()) sp.set("price_max", priceMax.trim());
    const q = sp.toString();
    router.push(q ? `/parts?${q}` : "/parts");
  };

  const clear = () => {
    setManufacturerId("");
    setCategoryId("");
    setModel("");
    setKeyword("");
    setMpn("");
    setExcludeAsk(false);
    setPriceMin("");
    setPriceMax("");
    router.push("/parts");
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-medium">パーツを検索</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MobilePicker
          label="メーカー"
          value={manufacturerId}
          onChange={setManufacturerId}
          options={[
            { value: "", label: "すべて" },
            ...manufacturers.map((m) => ({ value: m.id, label: m.label })),
          ]}
          placeholder="すべて"
        />
        <MobilePicker
          label="カテゴリ"
          value={categoryId}
          onChange={setCategoryId}
          options={[
            { value: "", label: "すべて" },
            ...categories.map((c) => ({ value: c.id, label: c.label })),
          ]}
          placeholder="すべて"
        />
        <label className="block text-sm">
          <span className="text-muted">車種</span>
          <input
            type="search"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="例: CB400SF（汎用は一覧で表示）"
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">キーワード</span>
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="パーツ名・説明"
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">品番</span>
          <input
            type="search"
            value={mpn}
            onChange={(e) => setMpn(e.target.value)}
            placeholder="メーカー品番"
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 font-mono text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">価格（税抜）下限</span>
          <input
            type="number"
            min={0}
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            placeholder="例: 10000"
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">価格（税抜）上限</span>
          <input
            type="number"
            min={0}
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            placeholder="例: 50000"
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm"
          />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={excludeAsk}
          onChange={(e) => setExcludeAsk(e.target.checked)}
          className="rounded border-border"
        />
        <span>ASK（価格未定）を除外</span>
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black"
        >
          検索
        </button>
        <button
          type="button"
          onClick={clear}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          条件をクリア
        </button>
      </div>
    </form>
  );
}
