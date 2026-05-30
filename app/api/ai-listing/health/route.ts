import { NextRequest, NextResponse } from "next/server";
import { isAiListingOpenAiConfigured } from "@/lib/ai-listing-config";
import { extractVehiclesFromImage } from "@/lib/openai/vision-listing-extract";

/** 1×1 PNG（疎通確認用・トークン最小） */
const PROBE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** 運用確認用: OpenAI キーがサーバー環境に読み込まれているか（値は返さない） */
export async function GET(req: NextRequest) {
  const configured = isAiListingOpenAiConfigured();
  const body: Record<string, unknown> = {
    openaiConfigured: configured,
    visionModel: process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini",
  };

  if (req.nextUrl.searchParams.get("visionProbe") === "1" && configured) {
    try {
      const result = await extractVehiclesFromImage(PROBE_PNG_BASE64, "image/png");
      body.visionProbe = "ok";
      body.visionProbeModel = result.model;
      body.visionProbeUsage = {
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
      };
    } catch (e) {
      body.visionProbe = "failed";
      body.visionProbeError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json(body);
}
