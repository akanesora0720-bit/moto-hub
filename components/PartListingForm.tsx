"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PartFeeNotice } from "@/components/PartFeeNotice";
import { PartModelSuggest } from "@/components/PartModelSuggest";
import { ActionButton, AsyncMessage, AsyncStatusBanner } from "@/components/ui/async-ui";
import type { PartCategory, PartManufacturer } from "@/lib/part-catalog";
import {
  PART_LISTING_MAX_FILES,
  partListingImagePath,
  uploadPartFiles,
} from "@/lib/part-images";
import { useAsyncAction } from "@/lib/use-async-action";
import { createClient } from "@/lib/supabase/client";

export function PartListingForm({
  manufacturers,
  categories,
}: {
  manufacturers: PartManufacturer[];
  categories: PartCategory[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const { loading, success, message, run } = useAsyncAction();
  const [manufacturerId, setManufacturerId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [modelDisplay, setModelDisplay] = useState("");
  const [isUniversalModel, setIsUniversalModel] = useState(false);
  const [form, setForm] = useState({
    part_name: "",
    manufacturer_part_number: "",
    part_condition: "中古",
    description: "",
    price_display_type: "fixed",
    price_ex_tax: "",
    shipping_bearer: "buyer",
  });

  const submit = async () => {
    await run(async () => {
      const payload = {
        manufacturer_id: manufacturerId,
        category_id: categoryId,
        model_display_name: isUniversalModel ? "汎用" : modelDisplay.trim(),
        is_universal_model: isUniversalModel,
        part_name: form.part_name.trim(),
        manufacturer_part_number: form.manufacturer_part_number.trim(),
        part_condition: form.part_condition.trim(),
        description: form.description.trim(),
        price_display_type: form.price_display_type,
        price_ex_tax:
          form.price_display_type === "fixed"
            ? Number(form.price_ex_tax || 0)
            : null,
        shipping_bearer: form.shipping_bearer,
      };

      const res = await fetch("/api/parts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string; id?: string; seller_id?: string };
      if (!res.ok) {
        return { error: data.error ?? "パーツ出品に失敗しました。" };
      }
      if (data.id && imageFiles.length > 0) {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const sellerId = data.seller_id ?? user?.id;
        if (!sellerId) {
          return { error: "画像アップロードのため再ログインしてください。" };
        }
        const paths = imageFiles.map((f, i) => {
          const ext = f.name.split(".").pop()?.toLowerCase() || "jpg";
          const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
          return partListingImagePath(sellerId, data.id!, `${i}.${safeExt}`);
        });
        const uploaded = await uploadPartFiles(supabase, paths, imageFiles);
        if (uploaded.error) {
          return { error: `出品は作成済みですが画像アップロードに失敗: ${uploaded.error}` };
        }
        for (let i = 0; i < uploaded.paths.length; i++) {
          const { error: imgErr } = await supabase.from("part_listing_images").insert({
            part_listing_id: data.id,
            storage_path: uploaded.paths[i],
            sort_order: i,
          });
          if (imgErr) {
            return { error: imgErr.message };
          }
        }
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
    !manufacturerId ||
    !categoryId ||
    (!isUniversalModel && !modelDisplay.trim()) ||
    (form.price_display_type === "fixed" && Number(form.price_ex_tax || 0) <= 0);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">パーツ出品</h2>
      <p className="text-sm text-muted">
        メーカー・カテゴリは一覧から選択。車種は候補から選ぶか入力（初出の車種は自動登録されます）。
      </p>
      <PartFeeNotice variant="compact" />
      <AsyncStatusBanner loading={loading} />
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm">
          <span className="text-muted">メーカー</span>
          <select
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5"
            value={manufacturerId}
            onChange={(e) => {
              setManufacturerId(e.target.value);
              setModelDisplay("");
              setIsUniversalModel(false);
            }}
          >
            <option value="">選択してください</option>
            {manufacturers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted">カテゴリ</span>
          <select
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">選択してください</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <div className="md:col-span-2">
          <PartModelSuggest
            manufacturerId={manufacturerId}
            value={modelDisplay}
            disabled={!manufacturerId}
            onChange={(display, universal) => {
              setModelDisplay(display);
              setIsUniversalModel(universal);
            }}
          />
        </div>
        <input
          className="rounded border border-border bg-zinc-950 px-3 py-2 md:col-span-2"
          placeholder="パーツ名"
          value={form.part_name}
          onChange={(e) => setForm((v) => ({ ...v, part_name: e.target.value }))}
        />
        <input
          className="rounded border border-border bg-zinc-950 px-3 py-2 font-mono"
          placeholder="メーカー品番（任意・検索用）"
          value={form.manufacturer_part_number}
          onChange={(e) =>
            setForm((v) => ({ ...v, manufacturer_part_number: e.target.value }))
          }
        />
        <input
          className="rounded border border-border bg-zinc-950 px-3 py-2"
          placeholder="状態（例: 中古A）"
          value={form.part_condition}
          onChange={(e) => setForm((v) => ({ ...v, part_condition: e.target.value }))}
        />
        <select
          className="rounded border border-border bg-zinc-950 px-3 py-2"
          value={form.shipping_bearer}
          onChange={(e) => setForm((v) => ({ ...v, shipping_bearer: e.target.value }))}
        >
          <option value="buyer">送料: 買い手負担</option>
          <option value="seller">送料: 売り手負担</option>
          <option value="consult">送料: 要相談</option>
        </select>
      </div>
      <textarea
        className="w-full rounded border border-border bg-zinc-950 px-3 py-2"
        rows={4}
        placeholder="説明文"
        value={form.description}
        onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))}
      />
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files;
            if (!picked?.length) return;
            setImageFiles((prev) =>
              [...prev, ...Array.from(picked)].slice(0, PART_LISTING_MAX_FILES),
            );
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg border border-border px-3 py-2 text-sm hover:border-accent"
        >
          写真を追加（最大{PART_LISTING_MAX_FILES}枚）
        </button>
        {imageFiles.length > 0 ? (
          <p className="mt-2 text-xs text-muted">{imageFiles.length}枚選択中</p>
        ) : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <select
          className="rounded border border-border bg-zinc-950 px-3 py-2"
          value={form.price_display_type}
          onChange={(e) => setForm((v) => ({ ...v, price_display_type: e.target.value }))}
        >
          <option value="fixed">価格表示: 固定</option>
          <option value="ask">価格表示: ASK</option>
        </select>
        <input
          disabled={form.price_display_type === "ask"}
          className="rounded border border-border bg-zinc-950 px-3 py-2 disabled:opacity-50"
          placeholder="価格(税抜)"
          value={form.price_ex_tax}
          onChange={(e) => setForm((v) => ({ ...v, price_ex_tax: e.target.value }))}
        />
      </div>
      <AsyncMessage message={message} success={success} />
      <ActionButton
        onClick={submit}
        loading={loading}
        success={success}
        disabled={invalid}
        loadingLabel="出品中…"
        successLabel="出品済み"
      >
        出品する
      </ActionButton>
    </div>
  );
}
