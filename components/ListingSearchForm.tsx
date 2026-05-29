"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { normalizeIdentifierInput } from "@/lib/normalize";
import { MobilePicker } from "@/components/MobilePicker";
import { MAKERS, VEHICLE_CLASSES } from "@/lib/constants";
import type { VehicleClass } from "@/lib/constants";
import {
  isPrefectureInListingSearchRegion,
  isValidPrefecture,
  LISTING_SEARCH_REGIONS,
  PREFECTURES,
} from "@/lib/prefectures";
import { parseListingSearch } from "@/lib/listing-search";

export function ListingSearchForm({ action = "/search" }: { action?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsed = parseListingSearch({
    maker: searchParams.get("maker") ?? undefined,
    model: searchParams.get("model") ?? undefined,
    frame: searchParams.get("frame") ?? undefined,
    vehicle_class: searchParams.get("vehicle_class") ?? undefined,
    region: searchParams.get("region") ?? undefined,
    prefecture: searchParams.get("prefecture") ?? undefined,
    motohub_only: searchParams.get("motohub_only") ?? undefined,
  });

  const [maker, setMaker] = useState(parsed.maker ?? "");
  const [model, setModel] = useState(parsed.model ?? "");
  const [frame, setFrame] = useState(parsed.frameNumber ?? "");
  const [vehicleClass, setVehicleClass] = useState(parsed.vehicleClass ?? "");
  const [region, setRegion] = useState(parsed.region ?? "");
  const [prefecture, setPrefecture] = useState(parsed.prefecture ?? "");
  const [motohubOnly, setMotohubOnly] = useState(parsed.motohubOnly ?? false);

  const prefectureOptions = useMemo(() => {
    const base = [{ value: "", label: "すべて" }];
    if (!region) {
      return [...base, ...PREFECTURES.map((p) => ({ value: p, label: p }))];
    }
    const group = LISTING_SEARCH_REGIONS.find((r) => r.slug === region);
    const prefs = group?.prefectures ?? [];
    return [
      { value: "", label: "エリア内すべて" },
      ...prefs.map((p) => ({ value: p, label: p })),
    ];
  }, [region]);

  const onRegionChange = (next: string) => {
    setRegion(next);
    if (
      prefecture &&
      next &&
      !isPrefectureInListingSearchRegion(
        prefecture,
        next as (typeof LISTING_SEARCH_REGIONS)[number]["slug"],
      )
    ) {
      setPrefecture("");
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const sp = new URLSearchParams();
    if (maker) sp.set("maker", maker);
    if (model.trim()) sp.set("model", normalizeIdentifierInput(model.trim()));
    if (frame.trim()) sp.set("frame", normalizeIdentifierInput(frame.trim()));
    if (vehicleClass) sp.set("vehicle_class", vehicleClass);
    if (region) sp.set("region", region);
    if (prefecture && isValidPrefecture(prefecture)) sp.set("prefecture", prefecture);
    if (motohubOnly) sp.set("motohub_only", "1");
    const q = sp.toString();
    router.push(q ? `${action}?${q}` : action);
  };

  const clear = () => {
    setMaker("");
    setModel("");
    setFrame("");
    setVehicleClass("");
    setRegion("");
    setPrefecture("");
    setMotohubOnly(false);
    router.push(action);
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-border bg-card p-4"
    >
      <p className="text-sm font-medium">在庫を検索</p>
      <p className="mt-1 text-xs text-muted">
        直引き・引取の目安として、出品店舗の所在地（都道府県）で絞り込めます。
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MobilePicker
          label="広域エリア"
          value={region}
          onChange={onRegionChange}
          options={[
            { value: "", label: "全国" },
            ...LISTING_SEARCH_REGIONS.map((r) => ({ value: r.slug, label: r.label })),
          ]}
          placeholder="全国"
        />
        <MobilePicker
          label="都道府県"
          value={prefecture}
          onChange={setPrefecture}
          options={prefectureOptions}
          placeholder="すべて"
        />
        <MobilePicker
          label="メーカー"
          value={maker}
          onChange={setMaker}
          options={[{ value: "", label: "すべて" }, ...MAKERS.map((m) => ({ value: m, label: m }))]}
          placeholder="すべて"
        />
        <MobilePicker
          label="車種区分"
          value={vehicleClass}
          onChange={(v) => setVehicleClass(v as VehicleClass | "")}
          options={[
            { value: "", label: "すべて" },
            ...VEHICLE_CLASSES.map((v) => ({ value: v.value, label: v.label })),
          ]}
          placeholder="すべて"
        />
        <label className="block text-sm">
          <span className="text-muted">車名</span>
          <input
            type="search"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="例: CB400SF"
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-muted">車台番号（一部）</span>
          <input
            type="search"
            value={frame}
            onChange={(e) => setFrame(normalizeIdentifierInput(e.target.value))}
            placeholder="例: NC42-120"
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 font-mono text-sm"
          />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={motohubOnly}
          onChange={(e) => setMotohubOnly(e.target.checked)}
          className="rounded border-border"
        />
        <span>Moto-Hub査定済のみ</span>
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
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
