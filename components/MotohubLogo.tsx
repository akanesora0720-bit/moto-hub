import Image from "next/image";
import { BRAND } from "@/lib/brand";

type MotohubLogoProps = {
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
};

/** Moto-Hub 公式ロゴ（public/logo.png）。白背景の横組みワードマーク。 */
export function MotohubLogo({
  width = 200,
  height = 48,
  className = "h-8 w-auto",
  priority = false,
}: MotohubLogoProps) {
  return (
    <span className="inline-flex shrink-0 items-center overflow-hidden rounded-lg bg-white px-2 py-1 shadow-sm">
      <Image
        src={BRAND.logoSrc}
        alt={BRAND.productName}
        width={width}
        height={height}
        className={`object-contain object-left ${className}`}
        priority={priority}
        unoptimized
      />
    </span>
  );
}
