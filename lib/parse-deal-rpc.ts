/** Supabase RPC が単体 or 配列で返す deals 行を正規化 */
export function parseDealRpcRow<T extends Record<string, unknown>>(
  data: unknown,
): T | null {
  if (data == null) return null;
  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === "object" ? (first as T) : null;
  }
  if (typeof data === "object") return data as T;
  return null;
}
