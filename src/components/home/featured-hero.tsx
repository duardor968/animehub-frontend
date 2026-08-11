"use client";

import useEmblaCarousel from "embla-carousel-react";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { AnimeSummary } from "@/lib/api/client";
import { formatStatus } from "@/lib/format";
import { AnimeImage } from "../anime-image";

export function FeaturedHero({ anime }: { anime: AnimeSummary[] }) {
  const [viewportRef, embla] = useEmblaCarousel({ loop: anime.length > 1 });
  const [selected, setSelected] = useState(0);

  const syncSelected = useCallback(() => {
    if (embla) setSelected(embla.selectedScrollSnap());
  }, [embla]);

  useEffect(() => {
    if (!embla) return;
    embla.on("select", syncSelected);
    embla.on("reInit", syncSelected);
    return () => {
      embla.off("select", syncSelected);
      embla.off("reInit", syncSelected);
    };
  }, [embla, syncSelected]);

  return (
    <section className="featured-carousel" aria-label="Destacados">
      <div className="featured-viewport" ref={viewportRef}>
        <div className="featured-track">
          {anime.map((item, index) => (
            <article className="featured-slide" key={item.id}>
              <div className="hero-image" aria-hidden="true">
                <AnimeImage
                  src={item.backdropUrl}
                  fallbackSrc={item.posterUrl}
                  alt=""
                  priority={index === 0}
                  sizes="100vw"
                />
              </div>
              <div className="hero-vignette" aria-hidden="true" />
              <div className="hero-content">
                <div className="hero-meta" aria-label="Datos principales">
                  <span className="status-dot" />
                  <span>{formatStatus(item.status)}</span>
                  {item.category && <span>{item.category.name}</span>}
                  {item.startDate && (
                    <span>{new Date(item.startDate).getUTCFullYear()}</span>
                  )}
                </div>
                <h1>{item.title}</h1>
                <p>{item.synopsis}</p>
                <div className="hero-actions">
                  <Link className="primary-button" href={`/anime/${item.slug}`}>
                    Ver ficha <ArrowRight size={17} />
                  </Link>
                  <a
                    className="secondary-button"
                    href={`https://animeav1.com/media/${item.slug}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    AnimeAV1 <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
      {anime.length > 1 && (
        <div className="hero-controls">
          <div
            className="hero-progress"
            aria-label={`Destacado ${selected + 1} de ${anime.length}`}
          >
            {anime.map((item, index) => (
              <button
                aria-label={`Mostrar ${item.title}`}
                aria-current={index === selected ? "true" : undefined}
                key={item.id}
                onClick={() => embla?.scrollTo(index)}
              />
            ))}
            <span>
              {String(selected + 1).padStart(2, "0")} /{" "}
              {String(anime.length).padStart(2, "0")}
            </span>
          </div>
          <div className="hero-arrows">
            <button
              onClick={() => embla?.scrollPrev()}
              aria-label="Destacado anterior"
            >
              <ArrowLeft size={18} />
            </button>
            <button
              onClick={() => embla?.scrollNext()}
              aria-label="Destacado siguiente"
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
