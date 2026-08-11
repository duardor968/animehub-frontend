import Link from "next/link";
import type { components } from "@/lib/api/generated";
import { formatEpisodeNumber, formatRelativeTime } from "@/lib/format";
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
                src={episode.imageUrl}
                fallbackSrc={anime.posterUrl}
                alt={`Fotograma del episodio ${episode.number} de ${anime.title}`}
                sizes="(max-width: 700px) 92vw, (max-width: 1100px) 45vw, 23vw"
              />
              <div className="recent-shade" />
              <div className="episode-badge">
                <span>EP</span>
                <strong>{formatEpisodeNumber(episode.number)}</strong>
              </div>
              <time dateTime={episode.publishedAt ?? undefined}>
                {formatRelativeTime(episode.publishedAt)}
              </time>
            </div>
            <h3>{anime.title}</h3>
            {episode.title && <p>{episode.title}</p>}
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
