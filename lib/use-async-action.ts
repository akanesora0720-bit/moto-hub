"use client";

import { useCallback, useState } from "react";

export type AsyncPhase = "idle" | "loading" | "success" | "error";

export function useAsyncAction() {
  const [phase, setPhase] = useState<AsyncPhase>("idle");
  const [message, setMessage] = useState("");

  const loading = phase === "loading";
  const success = phase === "success";

  const run = useCallback(
    async (
      fn: () => Promise<{ error?: string | null; okMessage?: string }>,
    ) => {
      if (phase === "loading") return false;
      setPhase("loading");
      setMessage("");
      try {
        const result = await fn();
        if (result.error) {
          setMessage(result.error);
          setPhase("error");
          return false;
        }
        const ok = result.okMessage ?? "完了しました。";
        setMessage(ok);
        setPhase("success");
        return true;
      } catch (e) {
        setMessage(e instanceof Error ? e.message : String(e));
        setPhase("error");
        return false;
      }
    },
    [phase],
  );

  const reset = useCallback(() => {
    setMessage("");
    setPhase("idle");
  }, []);

  return { loading, success, phase, message, run, reset, setMessage };
}
