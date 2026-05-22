"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { MAKERS, VEHICLE_CLASSES } from "@/lib/constants";
import type { VehicleClass } from "@/lib/constants";
import { parseListingSearch } from "@/lib/listing-search";

export function ListingSearchForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsed = parseListingSearch({
    maker: searchParams.get("maker") ?? undefined,
    model: searchParams.get("model") ?? undefined,
    frame: searchParams.get("frame") ?? undefined,
    vehicle_class: searchParams.get("vehicle_class") ?? undefined,
  });

  const [maker, setMaker] = useState(parsed.maker ?? "");
  const [model, setModel] = useState(parsed.model ?? "");
  const [frame, setFrame] = useState(parsed.frameNumber ?? "");
  const [vehicleClass, setVehicleClass] = useState(parsed.vehicleClass ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const sp = new URLSearchParams();
    if (maker) sp.set("maker", maker);
    if (model.trim()) sp.set("model", model.trim());
    if (frame.trim()) sp.set("frame", frame.trim());
    if (vehicleClass) sp.set("vehicle_class", vehicleClass);
    const q = sp.toString();
    router.push(q ? `/?${q}` : "/");
  };

  const clear = () => {
    setMaker("");
    setModel("");
    setFrame("");
    setVehicleClass("");
    router.push("/");
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-border bg-card p-4"
    >
      <p className="text-sm font-medium">在庫を検索</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm">
          <span className="text-muted">メーカー</span>
          <select
            value={maker}
            onChange={(e) => setMaker(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm"
          >
            <option value="">すべて</option>
            {MAKERS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted">車種区分</span>
          <select
            value={vehicleClass}
            onChange={(e) => setVehicleClass(e.target.value as VehicleClass | "")}
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm"
          >
            <option value="">すべて</option>
            {VEHICLE_CLASSES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
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
            onChange={(e) => setFrame(e.target.value)}
            placeholder="例: NC42-120"
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 font-mono text-sm"
          />
        </label>
      </div>
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
