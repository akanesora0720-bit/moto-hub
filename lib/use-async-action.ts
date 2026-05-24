"use client";

import { useCallback, useState } from "react";

export function useAsyncAction() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const run = useCallback(
    async (
      fn: () => Promise<{ error?: string | null; okMessage?: string }>,
    ) => {
      if (loading) return false;
      setLoading(true);
      setMessage("");
      setSuccess(false);
      try {
        const result = await fn();
        if (result.error) {
          setMessage(result.error);
          return false;
        }
        const ok = result.okMessage ?? "完了しました。";
        setMessage(ok);
        setSuccess(true);
        return true;
      } catch (e) {
        setMessage(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setLoading(false);
      }
    },
    [loading],
  );

  const reset = useCallback(() => {
    setMessage("");
    setSuccess(false);
  }, []);

  return { loading, message, success, run, reset, setMessage };
}
