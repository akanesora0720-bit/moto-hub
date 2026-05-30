import { NextResponse } from "next/server";
import { isAiListingOpenAiConfigured } from "@/lib/ai-listing-config";

/** 運用確認用: OpenAI キーがサーバー環境に読み込まれているか（値は返さない） */
export async function GET() {
  return NextResponse.json({
    openaiConfigured: isAiListingOpenAiConfigured(),
    visionModel: process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini",
  });
}
