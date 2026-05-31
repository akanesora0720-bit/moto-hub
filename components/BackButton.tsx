"use client";

import { useRouter } from "next/navigation";

type BackButtonProps = {
  /** 履歴がない・直接URL時の遷移先 */
  fallbackHref: string;
  /** ボタン表示文言 */
  label?: string;
  className?: string;
};

/**
 * ブラウザ履歴があれば router.back()、なければ fallbackHref へ遷移。
 */
export function BackButton({
  fallbackHref,
  label = "← 戻る",
  className = "inline-flex min-h-10 items-center text-sm text-muted hover:text-accent",
}: BackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  };

  return (
    <button type="button" onClick={handleClick} className={className}>
      {label}
    </button>
  );
}
