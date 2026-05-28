import Image from "next/image";
import { BRAND } from "@/lib/brand";

type MotohubLogoProps = {
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
};

/** MotoHub 公式ロゴ（public/logo.jpg）。Vercel でも確実に表示するため unoptimized。 */
export function MotohubLogo({
  width = 104,
  height = 34,
  className = "h-8 w-auto",
  priority = false,
}: MotohubLogoProps) {
  return (
    <Image
      src={BRAND.logoSrc}
      alt={BRAND.productName}
      width={width}
      height={height}
      className={className}
      priority={priority}
      unoptimized
    />
  );
}
