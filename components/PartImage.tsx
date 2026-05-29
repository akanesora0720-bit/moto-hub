"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { PART_IMAGE_BUCKET } from "@/lib/part-images";
import { createClient } from "@/lib/supabase/client";

export function PartImage({
  path,
  alt,
  className = "",
  fill = false,
  width,
  height,
}: {
  path: string | null;
  alt: string;
  className?: string;
  fill?: boolean;
  width?: number;
  height?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    const supabase = createClient();
    supabase.storage
      .from(PART_IMAGE_BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);

  if (!url) {
    return (
      <div
        className={`flex items-center justify-center bg-zinc-900 text-xs text-zinc-500 ${className}`}
      >
        No Image
      </div>
    );
  }

  if (fill) {
    return (
      <Image src={url} alt={alt} fill className={`object-cover ${className}`} unoptimized />
    );
  }

  return (
    <Image
      src={url}
      alt={alt}
      width={width ?? 400}
      height={height ?? 300}
      className={`object-cover ${className}`}
      unoptimized
    />
  );
}
