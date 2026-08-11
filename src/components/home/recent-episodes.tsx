import Link from "next/link";
import type { components } from "@/lib/api/generated";
import { AnimeImage } from "../anime-image";
import { EpisodeDownloadButton } from "../downloads/episode-download-button";

type RecentEpisode = components["schemas"]["RecentEpisodeDto"];

export function RecentEpisodes({ episodes }: { episodes: RecentEpisode[] }) {
  return (
    <div className="recent-grid">
      {episodes.map(({ anime, episode }) => (
        <article className="recent-item" key={episode.id}>
          <Link
            href={`/anime/${anime.slug}`}
            className="recent-link"
            aria-label={`${anime.title}, episodio ${episode.number}`}
          >
            <div className="recent-image">
              <AnimeImage
                src={anime.backdropUrl}
                alt={anime.title}
                sizes="(max-width: 700px) 100vw, 33vw"
              />
            </div>
            <div className="recent-shade" />
            <div className="recent-copy">
              <span>Episodio {episode.number}</span>
              <h3>{anime.title}</h3>
            </div>
          </Link>
          <EpisodeDownloadButton
            slug={anime.slug}
            title={anime.title}
            episodeNumber={episode.number}
          />
        </article>
      ))}
    </div>
  );
}
