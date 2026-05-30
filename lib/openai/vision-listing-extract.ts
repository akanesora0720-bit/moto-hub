import { normalizeAiVehicle, type AiExtractedVehicle } from "@/lib/ai-listing";

const MODEL = process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini";

const SYSTEM_PROMPT = `You are an expert at reading Japanese motorcycle dealer inventory screenshots (GooBike PAS, auction lists, dealer DMS, Excel exports photographed, etc.).

Rules:
- Extract EVERY distinct vehicle row/card visible in the image.
- Do NOT treat in-row thumbnail photos as assets to export; ignore images.
- Convert prices to integer yen. "71.7万円" → 717000. "76万円" → 760000.
- maker: Japanese manufacturer name (カワサキ, ホンダ, スズキ, ヤマハ, etc.)
- model: model name without maker prefix when possible
- frame_number: 車台番号 / 車体番号 alphanumeric
- repair_history: e.g. 修復無, 修復有
- warranty_text / maintenance_text: tag text if shown (保証, 整備)
- comment: extra features in title (ETC, ドラレコ, etc.)
- For each field include confidence 0.0-1.0 in the confidence object (e.g. confidence.frame_number).

Respond with JSON only: { "vehicles": [ { ...fields..., "confidence": { "maker": 0.95 } } ] }`;

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
    throw new Error("OPENAI_API_KEY is not configured");
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
              text: "この在庫一覧スクリーンショットから掲載車両をすべて抽出してください。",
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
