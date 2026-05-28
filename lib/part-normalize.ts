import { normalizeIdentifierInput } from "@/lib/normalize";

/** 車種名・品番用（全角英数→半角、大文字化、空白除去） */
export function normalizePartCatalogText(input: string): string {
  return normalizeIdentifierInput(input.trim());
}

export const PART_UNIVERSAL_MODEL_VALUE = "__UNIVERSAL__";
