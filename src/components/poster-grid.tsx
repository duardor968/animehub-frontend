import Link from "next/link";
import type { AnimeSummary } from "@/lib/api/client";
import { AnimeImage } from "./anime-image";

export function PosterGrid({ anime }: { anime: AnimeSummary[] }) {
  return (
    <div className="poster-grid">
      {anime.map((item) => (
        <article className="poster-item" key={item.id}>
          <Link className="poster-link" href={`/anime/${item.slug}`}>
            <div className="poster-media">
              <AnimeImage src={item.posterUrl} alt={item.title} />
            </div>
            <div className="poster-meta">
              <h3>{item.title}</h3>
              <p>
                {item.category?.name ?? "Anime"}
                {item.startDate
                  ? ` · ${new Date(item.startDate).getUTCFullYear()}`
                  : ""}
              </p>
            </div>
          </Link>
        </article>
      ))}
    </div>
  );
}
