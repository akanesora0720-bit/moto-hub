"use client";

import { useEffect } from "react";

const DEFAULT_FOCUS = "deal-primary-action";

/** 通知・一覧から開いたとき、チャット板ではなく「今やること」へスクロール */
export function DealDetailFocus({
  focusId = DEFAULT_FOCUS,
  autoFocus = true,
}: {
  focusId?: string;
  /** ハッシュ無しでも取引詳細の先頭操作へ寄せる */
  autoFocus?: boolean;
}) {
  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
    const targetId = hash || (autoFocus ? focusId : "");
    if (!targetId) return;

    const scroll = () => {
      document.getElementById(targetId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    };

    const t = window.setTimeout(scroll, 120);
    return () => window.clearTimeout(t);
  }, [focusId, autoFocus]);

  return null;
}
