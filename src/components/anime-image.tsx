"use client";

import Image from "next/image";
import { type SyntheticEvent, useMemo, useState } from "react";
import { preload } from "react-dom";
import mark from "@/assets/brand/animehub-mark.webp";

// Art-direction breakpoint, in sync with Tailwind's `sm` (40rem).
const MOBILE_MEDIA = "(max-width: 639.98px)";
const DESKTOP_MEDIA = "(min-width: 640px)";

type Candidate = { src?: string | null; mobileSrc?: string | null };

/**
 * Remote artwork with a skeleton while loading, a fallback chain
 * (src → fallbackSrc → branded placeholder) and optional art direction.
 *
 * Priority images (the LCP candidate) are preloaded with high fetch priority.
 * Priority and eager images are painted as soon as the browser decodes them;
 * only lazy images fade in, so above-the-fold art never waits for hydration.
 */
export function AnimeImage({
  src,
  fallbackSrc,
  mobileSrc,
  alt,
  priority = false,
  loading,
  sizes = "(max-width: 600px) 50vw, 20vw",
  imageClassName = "",
}: {
  src?: string | null;
  fallbackSrc?: string | null;
  /** Alternative art below 640px (e.g. the 2:3 poster for a phone hero). */
  mobileSrc?: string | null;
  alt: string;
  priority?: boolean;
  /** Defaults to eager for priority images and lazy otherwise. */
  loading?: "eager" | "lazy";
  sizes?: string;
  imageClassName?: string;
}) {
  const candidates = useMemo<Candidate[]>(
    () => [
      { src: src ?? null, mobileSrc: mobileSrc ?? null },
      { src: fallbackSrc },
    ],
    [fallbackSrc, mobileSrc, src],
  );
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  // First candidate with a usable URL. A failed mobile/desktop variant
  // degrades to the other one before moving on to the fallback.
  let active: { src: string; mobileSrc?: string } | null = null;
  for (const candidate of candidates) {
    const desktop =
      candidate.src && !failed.has(candidate.src) ? candidate.src : null;
    const mobile =
      candidate.mobileSrc && !failed.has(candidate.mobileSrc)
        ? candidate.mobileSrc
        : null;
    const primary = desktop ?? mobile;
    if (!primary) continue;
    active = {
      src: primary,
      mobileSrc: desktop && mobile && mobile !== desktop ? mobile : undefined,
    };
    break;
  }

  const activeKey = active ? `${active.src}\n${active.mobileSrc ?? ""}` : null;
  const artDirected = Boolean(active?.mobileSrc);

  // Art-directed preloads: each viewport only fetches the image it will show.
  // (Next's own `preload` prop would fetch the desktop art on phones too.)
  if (priority && active?.mobileSrc) {
    const options = {
      as: "image",
      fetchPriority: "high",
      referrerPolicy: "no-referrer",
    } as const;
    preload(active.mobileSrc, { ...options, media: MOBILE_MEDIA });
    preload(active.src, { ...options, media: DESKTOP_MEDIA });
  }

  if (!active) {
    return (
      <span
        className="anime-image anime-image-placeholder"
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
      >
        <Image
          src={mark}
          alt=""
          aria-hidden="true"
          width={80}
          height={60}
          unoptimized
          className="h-auto w-[min(36%,5rem)] min-w-3 opacity-35"
        />
      </span>
    );
  }

  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    // With <picture>, currentSrc is the URL that actually failed.
    const failedUrl = event.currentTarget.currentSrc || active.src;
    setLoadedKey(null);
    setFailed((current) => {
      const next = new Set(current);
      next.add(failedUrl);
      // Unknown currentSrc (error before any source was chosen): drop both.
      if (![active.src, active.mobileSrc].includes(failedUrl)) {
        next.add(active.src);
        if (active.mobileSrc) next.add(active.mobileSrc);
      }
      return next;
    });
  };

  const image = (
    <Image
      key={activeKey}
      src={active.src}
      alt={alt}
      fill
      preload={priority && !artDirected}
      fetchPriority={priority ? "high" : undefined}
      loading={priority ? "eager" : (loading ?? "lazy")}
      sizes={sizes}
      unoptimized
      referrerPolicy="no-referrer"
      className={imageClassName}
      onLoad={() => setLoadedKey(activeKey)}
      onError={handleError}
    />
  );

  // Eager images are above the fold: painted as soon as they decode. Only
  // lazy images wait for onLoad (after hydration) to fade in.
  const eager = priority || loading === "eager";
  const state =
    loadedKey === activeKey
      ? "is-loaded"
      : eager
        ? "is-immediate"
        : "is-loading";

  return (
    <span className={`anime-image ${state}`}>
      <span className="image-skeleton" aria-hidden="true" />
      {active.mobileSrc ? (
        <picture key={activeKey} className="absolute inset-0">
          <source media={MOBILE_MEDIA} srcSet={active.mobileSrc} />
          {image}
        </picture>
      ) : (
        image
      )}
    </span>
  );
}
