import Image from "next/image";
import { BRAND } from "@/lib/brand";

type MotohubLogoProps = {
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
  /** ロゴ横にワードマークを出す（既定: true） */
  showLabel?: boolean;
  labelClassName?: string;
};

/** サイドバー・ヘッダー用マーク＋ゴールドの MotoHub 表記 */
export function MotohubLogo({
  width = 36,
  height = 36,
  className = "h-9 w-9",
  priority = false,
  showLabel = true,
  labelClassName = "",
}: MotohubLogoProps) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Image
        src={BRAND.logoMarkSrc}
        alt=""
        width={width}
        height={height}
        className={`shrink-0 object-contain object-center ${className}`}
        priority={priority}
        unoptimized
        aria-hidden
      />
      {showLabel ? (
        <span
          className={`whitespace-nowrap text-lg font-semibold tracking-tight text-accent ${labelClassName}`}
        >
          {BRAND.logoLockupLabel}
        </span>
      ) : null}
    </span>
  );
}
