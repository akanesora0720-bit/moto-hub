import {
  isStrictVinValid,
  isValidYmdDateString,
  normalizeIdentifierInput,
  normalizeVinStrict,
} from "@/lib/normalize";
import type { ListingGrades } from "@/lib/types";
import { gradesToDbPayload, parsePriceYen, validateListingGrades } from "@/lib/listing-grades";

export type ListingFormVinState = {
  frameNumber: string;
  isOfficiallyStampedVin: boolean;
  vinNote: string;
};

export type ListingFormDateFields = {
  inspectionExpiryDate: string;
  liabilityInsuranceExpiryDate: string;
};

export function validateListingVin(state: ListingFormVinState): string | null {
  const normalized = normalizeVinStrict(state.frameNumber);
  if (!normalized) return "車台番号を入力してください。";
  if (!state.isOfficiallyStampedVin && !isStrictVinValid(normalized)) {
    return "車台番号は半角英数字とハイフンのみ使用できます。職権打刻・特殊番号の場合はチェックを入れてください。";
  }
  if (state.isOfficiallyStampedVin && !state.vinNote.trim()) {
    return "職権打刻・特殊車台番号の場合は備考の記載が必須です。";
  }
  return null;
}

export function validateOptionalYmd(
  value: string,
  label: string,
): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!isValidYmdDateString(v)) return `${label}の日付が不正です。`;
  return null;
}

export function buildListingDbPayload(input: {
  maker: string;
  model: string;
  vehicleClass: string;
  yearVal: number | null;
  mileageVal: number | null;
  vin: ListingFormVinState;
  modelDesignation: string;
  engineModel: string;
  mileageRollback: string;
  priceExTax: number;
  comment: string;
  dates: ListingFormDateFields;
  grades: ListingGrades;
  inspectionRemaining: string;
}) {
  const frame = normalizeVinStrict(input.vin.frameNumber);
  const modelDesignation = input.modelDesignation.trim()
    ? normalizeIdentifierInput(input.modelDesignation)
    : null;
  const engine = input.engineModel.trim()
    ? normalizeIdentifierInput(input.engineModel)
    : null;

  return {
    maker: input.maker,
    model: normalizeIdentifierInput(input.model),
    vehicle_class: input.vehicleClass,
    displacement_cc: null,
    year: input.yearVal,
    mileage: input.mileageVal,
    frame_number: frame,
    is_officially_stamped_vin: input.vin.isOfficiallyStampedVin,
    vin_note: input.vin.isOfficiallyStampedVin ? input.vin.vinNote.trim() : null,
    model_designation: modelDesignation,
    engine_model: engine,
    mileage_rollback: input.mileageRollback,
    price_ex_tax: input.priceExTax,
    condition_comment: input.comment.trim(),
    inspection_expiry_date: input.dates.inspectionExpiryDate.trim() || null,
    liability_insurance_expiry_date:
      input.dates.liabilityInsuranceExpiryDate.trim() || null,
    inspection_remaining: input.inspectionRemaining.trim() || null,
    ...gradesToDbPayload(input.grades),
  };
}

export function validateListingFormCore(input: {
  model: string;
  vehicleClass: string;
  price: string;
  comment: string;
  grades: ListingGrades;
  vin: ListingFormVinState;
  dates: ListingFormDateFields;
}): { error: string | null; priceExTax: number | null } {
  if (
    !input.model.trim() ||
    !input.vehicleClass ||
    !input.vin.frameNumber.trim() ||
    !input.price.trim() ||
    !input.comment.trim()
  ) {
    return { error: "必須項目を入力してください。", priceExTax: null };
  }

  const priceExTax = parsePriceYen(input.price);
  if (priceExTax == null) {
    return { error: "税抜価格は正の整数（円）で入力してください。", priceExTax: null };
  }

  const gradeError = validateListingGrades(input.grades);
  if (gradeError) return { error: gradeError, priceExTax: null };

  const vinError = validateListingVin(input.vin);
  if (vinError) return { error: vinError, priceExTax: null };

  for (const [value, label] of [
    [input.dates.inspectionExpiryDate, "車検満了日"],
    [input.dates.liabilityInsuranceExpiryDate, "自賠責満了日"],
  ] as const) {
    const dErr = validateOptionalYmd(value, label);
    if (dErr) return { error: dErr, priceExTax: null };
  }

  return { error: null, priceExTax };
}
