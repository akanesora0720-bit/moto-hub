"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { IdentifierField } from "@/components/IdentifierField";
import { ListingGradingInput } from "@/components/ListingGradingInput";
import { MobilePicker } from "@/components/MobilePicker";
import { VinField } from "@/components/VinField";
import { MAKERS, MILEAGE_ROLLBACK_OPTIONS, VEHICLE_CLASSES } from "@/lib/constants";
import type { MileageRollbackStatus, VehicleClass } from "@/lib/constants";
import {
  buildListingDbPayload,
  validateListingFormCore,
  type ListingFormVinState,
} from "@/lib/listing-form";
import { createClient } from "@/lib/supabase/client";
import { EMPTY_LISTING_GRADES, type ListingGrades } from "@/lib/types";

export type ListingEditorInitial = {
  maker: string;
  model: string;
  vehicle_class: VehicleClass | null;
  year: number | null;
  mileage: number | null;
  frame_number: string;
  mileage_rollback: MileageRollbackStatus;
  price_ex_tax: number;
  condition_comment: string;
  grades: ListingGrades;
  inspection_remaining: string | null;
  inspection_expiry_date?: string | null;
  liability_insurance_expiry_date?: string | null;
  model_designation?: string | null;
  engine_model?: string | null;
  is_officially_stamped_vin?: boolean;
  vin_note?: string | null;
};

type Props = {
  mode: "create" | "edit";
  listingId?: string;
  initial?: ListingEditorInitial;
  cancelHref?: string;
  /** スタッフ出品代行: 出品者を加盟店にする */
  sellerIdOverride?: string;
  /** 完了時に complete_motohub_inspection を呼ぶ */
  inspectionRequestId?: string;
  /** 親レイアウトに AppShell を含める場合 */
  embedded?: boolean;
};

function preventWheelChange(e: React.WheelEvent<HTMLInputElement>) {
  e.currentTarget.blur();
}

export function ListingEditorForm({
  mode,
  listingId,
  initial,
  cancelHref,
  sellerIdOverride,
  inspectionRequestId,
  embedded = false,
}: Props) {
  const router = useRouter();
  const [maker, setMaker] = useState(initial?.maker ?? MAKERS[0]);
  const [model, setModel] = useState(initial?.model ?? "");
  const [vehicleClass, setVehicleClass] = useState<VehicleClass | "">(
    initial?.vehicle_class ?? "",
  );
  const [year, setYear] = useState(
    initial?.year != null ? String(initial.year) : "",
  );
  const [mileage, setMileage] = useState(
    initial?.mileage != null ? String(initial.mileage) : "",
  );
  const [vin, setVin] = useState<ListingFormVinState>({
    frameNumber: initial?.frame_number ?? "",
    isOfficiallyStampedVin: initial?.is_officially_stamped_vin ?? false,
    vinNote: initial?.vin_note ?? "",
  });
  const [modelDesignation, setModelDesignation] = useState(
    initial?.model_designation ?? "",
  );
  const [engineModel, setEngineModel] = useState(initial?.engine_model ?? "");
  const [inspectionExpiryDate, setInspectionExpiryDate] = useState(
    initial?.inspection_expiry_date ?? "",
  );
  const [liabilityInsuranceExpiryDate, setLiabilityInsuranceExpiryDate] = useState(
    initial?.liability_insurance_expiry_date ?? "",
  );
  const [mileageRollback, setMileageRollback] = useState<MileageRollbackStatus>(
    initial?.mileage_rollback ?? "none",
  );
  const [price, setPrice] = useState(
    initial?.price_ex_tax != null ? String(initial.price_ex_tax) : "",
  );
  const [comment, setComment] = useState(initial?.condition_comment ?? "");
  const [grades, setGrades] = useState<ListingGrades>(initial?.grades ?? EMPTY_LISTING_GRADES);
  const [inspectionRemaining, setInspectionRemaining] = useState(
    initial?.inspection_remaining ?? "",
  );
  const [files, setFiles] = useState<FileList | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const isCreate = mode === "create";

  const submit = async () => {
    setMessage("");
    const core = validateListingFormCore({
      model,
      vehicleClass,
      price,
      comment,
      grades,
      vin,
      dates: {
        inspectionExpiryDate,
        liabilityInsuranceExpiryDate,
      },
    });
    if (core.error) {
      setMessage(core.error);
      return;
    }
    const priceExTax = core.priceExTax!;
    if (isCreate && (!files || files.length === 0)) {
      setMessage("写真を1枚以上添付してください。");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setLoading(false);
      setMessage("ログインが必要です。");
      return;
    }

    const yearTrim = year.trim();
    let yearVal: number | null = null;
    if (yearTrim) {
      const y = parseInt(yearTrim, 10);
      if (!Number.isFinite(y) || y < 1950 || y > 2100) {
        setMessage("年式は1950〜2100の範囲で入力してください。");
        return;
      }
      yearVal = y;
    }
    const mileageTrim = mileage.trim();
    let mileageVal: number | null = null;
    if (mileageTrim) {
      const m = parseInt(mileageTrim, 10);
      if (!Number.isFinite(m) || m < 0) {
        setMessage("走行距離は0以上の整数（km）で入力してください。");
        return;
      }
      mileageVal = m;
    }

    const payload = buildListingDbPayload({
      maker,
      model,
      vehicleClass,
      yearVal,
      mileageVal,
      vin,
      modelDesignation,
      engineModel,
      mileageRollback,
      priceExTax,
      comment,
      dates: {
        inspectionExpiryDate,
        liabilityInsuranceExpiryDate,
      },
      grades,
      inspectionRemaining,
    });

    if (isCreate) {
      const sellerId = sellerIdOverride ?? userData.user.id;
      const { data: listing, error: listingError } = await supabase
        .from("listings")
        .insert({ seller_id: sellerId, ...payload })
        .select("id")
        .single();

      if (listingError || !listing) {
        setLoading(false);
        setMessage(listingError?.message ?? "出品の作成に失敗しました。");
        return;
      }

      for (let i = 0; i < files!.length; i++) {
        const file = files![i];
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${sellerId}/${listing.id}/${i}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("listing-images")
          .upload(path, file, { upsert: true });
        if (uploadError) {
          setLoading(false);
          setMessage(`画像アップロード失敗: ${uploadError.message}`);
          return;
        }
        await supabase.from("listing_images").insert({
          listing_id: listing.id,
          storage_path: path,
          sort_order: i,
        });
      }

      if (inspectionRequestId) {
        const { error: completeError } = await supabase.rpc("complete_motohub_inspection", {
          p_request_id: inspectionRequestId,
          p_listing_id: listing.id,
        });
        if (completeError) {
          setLoading(false);
          setMessage(completeError.message);
          return;
        }
      }

      setLoading(false);
      router.replace(inspectionRequestId ? "/admin/inspections" : `/listings/${listing.id}`);
      router.refresh();
      return;
    }

    const { error: updateError } = await supabase
      .from("listings")
      .update(payload)
      .eq("id", listingId!)
      .eq("seller_id", userData.user.id);

    if (updateError) {
      setLoading(false);
      setMessage(updateError.message);
      return;
    }

    setLoading(false);
    router.replace(`/listings/${listingId}`);
    router.refresh();
  };

  const title = inspectionRequestId
    ? "出品代行登録"
    : isCreate
      ? "在庫を出品"
      : "出品を編集";
  const submitLabel = inspectionRequestId
    ? "登録してMotoHub査定済にする"
    : isCreate
      ? "出品する"
      : "保存する";
  const loadingLabel = inspectionRequestId
    ? "登録中…"
    : isCreate
      ? "出品中…"
      : "保存中…";

  const body = (
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          {cancelHref ? (
            <Link href={cancelHref} className="text-sm text-muted hover:text-accent">
              ← 戻る
            </Link>
          ) : null}
          <h1 className={`text-2xl font-semibold ${cancelHref ? "mt-3" : ""}`}>{title}</h1>
          <p className="mt-1 text-sm text-muted">
            {isCreate ? "税抜の業販価格で掲載します。" : "掲載中の情報を更新します。写真の変更はできません。"}
          </p>
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <MobilePicker
            label="メーカー"
            value={maker}
            onChange={setMaker}
            options={MAKERS.map((m) => ({ value: m, label: m }))}
          />
          <IdentifierField
            label="車名"
            value={model}
            onChange={setModel}
            required
            placeholder="CB400SF など"
            hint="英字は自動で大文字化されます。"
          />
          <MobilePicker
            label="車種区分"
            value={vehicleClass}
            onChange={(v) => setVehicleClass(v as VehicleClass | "")}
            options={[
              { value: "", label: "選択してください" },
              ...VEHICLE_CLASSES.map((v) => ({ value: v.value, label: v.label })),
            ]}
            placeholder="タップして車種区分を選択"
            required
            hint="免許・取引の区分。車名と排気量が一致しない車両も、この区分で登録してください。"
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-muted">年式（任意）</span>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                onWheel={preventWheelChange}
                placeholder="例: 2018"
                className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted">走行距離 km（任意）</span>
              <input
                type="number"
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                onWheel={preventWheelChange}
                className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm"
              />
            </label>
          </div>
          <VinField value={vin} onChange={setVin} />
          <IdentifierField
            label="型式"
            value={modelDesignation}
            onChange={setModelDesignation}
            placeholder="例: EBL-NC42A"
            hint="型式は半角で統一して保存されます。"
            mono
          />
          <IdentifierField
            label="エンジン型式"
            value={engineModel}
            onChange={setEngineModel}
            placeholder="例: NC42E"
            hint="エンジン型式は半角で統一して保存されます。"
            mono
          />
          <MobilePicker
            label="距離減算"
            value={mileageRollback}
            onChange={(v) => setMileageRollback(v as MileageRollbackStatus)}
            options={MILEAGE_ROLLBACK_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
          />
          <ListingGradingInput
            grades={grades}
            onChange={setGrades}
            inspectionExpiryDate={inspectionExpiryDate}
            onInspectionExpiryDateChange={setInspectionExpiryDate}
            liabilityInsuranceExpiryDate={liabilityInsuranceExpiryDate}
            onLiabilityInsuranceExpiryDateChange={setLiabilityInsuranceExpiryDate}
            inspectionRemaining={inspectionRemaining}
            onInspectionRemainingChange={setInspectionRemaining}
          />

          <label className="block text-sm">
            <span className="text-muted">税抜価格 (円) *</span>
            <input
              type="number"
              step={1}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onWheel={preventWheelChange}
              className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">状態コメント *</span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm"
            />
          </label>
          {isCreate ? (
            <label className="block text-sm">
              <span className="text-muted">写真（複数可）*</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setFiles(e.target.files)}
                className="mt-2 block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-medium file:text-black"
              />
            </label>
          ) : null}
        </div>

        {message ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
            {message}
          </p>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
        >
          {loading ? loadingLabel : submitLabel}
        </button>
      </div>
  );

  if (embedded) return body;
  return <AppShell>{body}</AppShell>;
}
