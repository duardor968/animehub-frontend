"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

const neutralImage = "/brand/cinematic-fallback.png";

export function AnimeImage({
  src,
  fallbackSrc,
  alt,
  priority = false,
  sizes = "(max-width: 600px) 50vw, 20vw",
}: {
  src?: string | null;
  fallbackSrc?: string | null;
  alt: string;
  priority?: boolean;
  sizes?: string;
}) {
  const sources = useMemo(
    () =>
      Array.from(
        new Set([src, fallbackSrc, neutralImage].filter(Boolean)),
      ) as string[],
    [fallbackSrc, src],
  );
  const [failed, setFailed] = useState<string[]>([]);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const activeSource =
    sources.find((source) => !failed.includes(source)) ?? neutralImage;
  const loaded = loadedSource === activeSource;

  return (
    <span
      className={loaded ? "anime-image is-loaded" : "anime-image is-loading"}
    >
      <span className="image-skeleton" aria-hidden="true" />
      <Image
        key={activeSource}
        src={activeSource}
        alt={alt}
        fill
        priority={priority}
        loading={priority ? "eager" : "lazy"}
        sizes={sizes}
        unoptimized
        referrerPolicy="no-referrer"
        onLoad={() => setLoadedSource(activeSource)}
        onError={() => {
          setLoadedSource(null);
          setFailed((current) =>
            current.includes(activeSource)
              ? current
              : [...current, activeSource],
          );
        }}
      />
    </span>
  );
}
