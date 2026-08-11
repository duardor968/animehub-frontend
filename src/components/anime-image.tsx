"use client";

import Image from "next/image";
import { useState } from "react";

export function AnimeImage({
  src,
  alt,
  fill = true,
  priority = false,
  sizes = "(max-width: 600px) 50vw, 20vw",
}: {
  src?: string | null;
  alt: string;
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="image-fallback" aria-label={`Sin imagen para ${alt}`}>
        {alt.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      priority={priority}
      loading={priority ? "eager" : "lazy"}
      sizes={sizes}
      onError={() => setFailed(true)}
    />
  );
}
