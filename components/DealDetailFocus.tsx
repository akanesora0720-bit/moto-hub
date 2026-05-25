"use client";

import { useEffect } from "react";

const DEFAULT_FOCUS = "deal-primary-action";

function scrollToId(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

/** 通知・一覧から開いたとき、チャット板ではなく「今やること」へスクロール */
export function DealDetailFocus({
  focusId = DEFAULT_FOCUS,
  enabled = true,
}: {
  focusId?: string;
  enabled?: boolean;
}) {
  useEffect(() => {
    if (!enabled) return;

    const hash =
      typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
    const targetId = hash || focusId;
    if (!targetId) return;

    const delays = [0, 200, 500, 1000, 1800];
    const timers = delays.map((ms) =>
      window.setTimeout(() => {
        scrollToId(targetId);
      }, ms),
    );

    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [focusId, enabled]);

  return null;
}
