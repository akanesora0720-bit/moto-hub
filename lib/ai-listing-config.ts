/** サーバー専用: AI出品サポートが OpenAI Vision を呼べるか */
export function isAiListingOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export const AI_LISTING_UNAVAILABLE_MESSAGE =
  "AI出品サポートは現在準備中です。しばらくしてから再度お試しいただくか、運営サポート（/support）へお問い合わせください。";
