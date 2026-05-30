/**
 * AI出品 Vision 疎通確認（ローカル / CI）
 * Usage: OPENAI_API_KEY=sk-... node scripts/verify-ai-vision.mjs [image-path]
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) {
  console.error("OPENAI_API_KEY is not set");
  process.exit(1);
}

const imagePath =
  process.argv[2] ??
  resolve(
    process.env.HOME ?? "",
    ".cursor/projects/Users-take-moto-hub/assets/__________2026-05-30_20.01.55-6a93e2f4-fae7-4898-99a8-286e226be59b.png",
  );

const buf = readFileSync(imagePath);
const mime = imagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
const model = process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini";
const b64 = buf.toString("base64");

const res = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Extract motorcycle inventory rows from the image. Respond JSON only: { \"vehicles\": [{ \"maker\": \"...\", \"model\": \"...\", \"price_ex_tax\": 0 }] }",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "在庫一覧から車両を抽出" },
          { type: "image_url", image_url: { url: `data:${mime};base64,${b64}`, detail: "high" } },
        ],
      },
    ],
  }),
});

const text = await res.text();
if (!res.ok) {
  console.error("OpenAI error", res.status, text.slice(0, 500));
  process.exit(1);
}

const json = JSON.parse(text);
const content = json.choices?.[0]?.message?.content ?? "";
const parsed = JSON.parse(content);
const count = Array.isArray(parsed.vehicles) ? parsed.vehicles.length : 0;
console.log(
  JSON.stringify(
    {
      ok: true,
      model,
      usage: json.usage,
      vehiclesDetected: count,
      sample: parsed.vehicles?.[0] ?? null,
    },
    null,
    2,
  ),
);
