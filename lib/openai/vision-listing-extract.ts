import { AI_LISTING_UNAVAILABLE_MESSAGE } from "@/lib/ai-listing-config";
import { normalizeAiVehicle, type AiExtractedVehicle } from "@/lib/ai-listing";

const MODEL = process.env.OPENAI_VISION_MODEL ?? "gpt-5.4-mini";

const SYSTEM_PROMPT = `You are an expert at reading Japanese motorcycle dealer inventory screenshots (especially GooBike PAS / pas.goobike.com list views).

Extract EVERY distinct vehicle listing row visible. Ignore thumbnail photos.

Required JSON fields per vehicle (use null only if truly absent; do NOT omit keys):
- maker: メーカー (カワサキ, ホンダ, スズキ, ヤマハ, etc.)
- model: 車種名 only, without maker prefix
- displacement_cc: integer cc from lines like "400cc", "223cc", "1500cc"
- year: integer Western year from "2023年", "2002年" (未記入 → null)
- mileage: integer km from "走行距離2843Km" or "走行距離 30812Km" (strip commas)
- color: from "色：マットブラック" / "色: 白／赤" on the line with 車台番号
- frame_number: 車台番号 / 車体番号 (e.g. EL400A-AT2002, NC42-2010713)
- price_ex_tax: integer yen from 本体価格. "71.7万円" → 717000
- total_price_inc_tax: integer yen from 支払総額 if shown
- inspection_text: e.g. "検2026年11月" from the spec line
- insurance_text: e.g. "保険なし" if shown
- repair_history: 修復無 / 修復有 from badges
- warranty_text / maintenance_text: 保証 / 整備 badges if present
- comment: title extras (ETC, ドラレコ, etc.)
- vehicle_class: one of exactly these enum strings (infer from cc + model name):
  - "gentsuki_1" = 原付一種, displacement 50cc or below (listings often show "50cc")
  - "gentsuki_2" = 原付二種, 51–125cc (often shown as "125cc" max in listings)
  - "medium" = 中型, 126–400cc
  - "large" = 大型, 401cc and above
  - "three_wheel" = 三輪 / トライク / Spyder etc., regardless of cc
  - "kid_bike" = キットバイク / assembled kit bikes, obscure kit-only makers

GooBike PAS layout hint (typical row):
Line1: maker + model title
Line2: "400cc 2023年 検2026年11月 走行距離2843Km" (parse all four: cc, year, inspection, mileage)
Line3: "色：マットブラック 車台番号：EL400A-AT2002" (parse color and frame_number)

confidence: 0.0-1.0 per field in a nested "confidence" object.

Respond with JSON only: { "vehicles": [ { "maker", "model", "displacement_cc", "vehicle_class", "year", "mileage", "color", "frame_number", ... , "confidence": {} } ] }`;

export type VisionExtractResult = {
  vehicles: AiExtractedVehicle[];
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  raw: unknown;
};

export async function extractVehiclesFromImage(
  imageBase64: string,
  mimeType: string,
): Promise<VisionExtractResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(AI_LISTING_UNAVAILABLE_MESSAGE);
  }

  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "この在庫一覧（GooBike PAS等）のスクリーンショットから、表示されている全車両を抽出してください。各行について排気量(displacement_cc)・車種区分(vehicle_class)・年式(year)・走行距離(mileage)・色(color)・車台番号(frame_number)・本体価格(price_ex_tax)を必ず埋めてください。未記入の年式は year を null にしてください。トライクは three_wheel、キットバイクは kid_bike。",
            },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${errText.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty OpenAI response");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Failed to parse OpenAI JSON response");
  }

  const vehiclesRaw = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && "vehicles" in parsed
      ? (parsed as { vehicles: unknown }).vehicles
      : [];

  if (!Array.isArray(vehiclesRaw)) {
    throw new Error("OpenAI response missing vehicles array");
  }

  const vehicles = vehiclesRaw
    .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
    .map((v) => normalizeAiVehicle(v));

  return {
    vehicles,
    model: MODEL,
    promptTokens: json.usage?.prompt_tokens ?? null,
    completionTokens: json.usage?.completion_tokens ?? null,
    raw: parsed,
  };
}
