"use client";

import Image from "next/image";
import { useState } from "react";

export function AnimeImage({
  src,
  fallbackSrc,
  alt,
  fill = true,
  priority = false,
  sizes = "(max-width: 600px) 50vw, 20vw",
}: {
  src?: string | null;
  fallbackSrc?: string | null;
  alt: string;
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
}) {
  const [failedSource, setFailedSource] = useState(false);
  const [failedFallback, setFailedFallback] = useState(false);
  const activeSource = failedSource ? fallbackSrc : src;
  if (!activeSource || (failedSource && failedFallback))
    return (
      <span className="image-fallback" aria-label={`Sin imagen para ${alt}`} />
    );
  return (
    <Image
      src={activeSource}
      alt={alt}
      fill={fill}
      priority={priority}
      loading={priority ? "eager" : "lazy"}
      sizes={sizes}
      onError={() => {
        if (!failedSource && fallbackSrc && fallbackSrc !== src) {
          setFailedSource(true);
        } else {
          setFailedFallback(true);
        }
      }}
    />
  );
}
