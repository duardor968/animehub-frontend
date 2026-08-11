import { ArrowRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { AnimeSummary } from "@/lib/api/client";
import { AnimeImage } from "../anime-image";

export function FeaturedHero({ anime }: { anime: AnimeSummary }) {
  return (
    <section className="featured-hero">
      <div className="hero-image" aria-hidden="true">
        <AnimeImage src={anime.backdropUrl} alt="" priority sizes="100vw" />
      </div>
      <div className="hero-vignette" aria-hidden="true" />
      <div className="hero-content enter">
        <span className="eyebrow">En foco</span>
        <h1>{anime.title}</h1>
        <p>{anime.synopsis}</p>
        <div className="hero-actions">
          <Link className="primary-button" href={`/anime/${anime.slug}`}>
            Abrir ficha <ArrowRight size={16} />
          </Link>
          <a
            className="secondary-button"
            href={`https://animeav1.com/media/${anime.slug}`}
            target="_blank"
            rel="noreferrer"
          >
            Fuente <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </section>
  );
}
