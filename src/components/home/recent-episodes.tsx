import Link from "next/link";
import type { components } from "@/lib/api/generated";
import { formatEpisodeNumber, formatRelativeTime } from "@/lib/format";
import { AnimeImage } from "../anime-image";
import { EpisodeDownloadButton } from "../downloads/episode-download-button";
import {
  MediaCard,
  MediaCardBody,
  MediaCardLabel,
  MediaCardMedia,
} from "../media-card";
import { POSTER_GRID_CLASS, POSTER_GRID_SIZES } from "../poster-grid";

type RecentEpisode = components["schemas"]["RecentEpisodeDto"];

export function RecentEpisodes({ episodes }: { episodes: RecentEpisode[] }) {
  return (
    <div className={POSTER_GRID_CLASS}>
      {episodes.map(({ anime, episode }) => {
        const number = formatEpisodeNumber(episode.number);
        const ago = episode.publishedAt
          ? formatRelativeTime(episode.publishedAt)
          : null;
        const published = ago ? (
          <time
            dateTime={episode.publishedAt ?? undefined}
            suppressHydrationWarning
          >
            {ago}
          </time>
        ) : null;
        return (
          <MediaCard key={episode.id}>
            <Link
              href={`/anime/${anime.slug}`}
              prefetch={false}
              aria-label={[
                anime.title,
                `episodio ${number}${episode.title ? `: ${episode.title}` : ""}`,
                ago,
              ]
                .filter(Boolean)
                .join(", ")}
              // The relative time can tick between server render and hydration.
              suppressHydrationWarning
              className="flex flex-1 flex-col outline-none"
            >
              <MediaCardMedia aspect="still">
                <AnimeImage
                  src={episode.imageUrl}
                  fallbackSrc={anime.backdropUrl ?? anime.posterUrl}
                  alt=""
                  sizes={POSTER_GRID_SIZES}
                />
                <MediaCardLabel>
                  EP <strong>{number}</strong>
                </MediaCardLabel>
              </MediaCardMedia>
              <MediaCardBody
                title={anime.title}
                meta={
                  episode.title && published ? (
                    <span className="flex gap-1">
                      <span className="truncate">{episode.title}</span>·
                      {published}
                    </span>
                  ) : (
                    (episode.title ?? published)
                  )
                }
              />
            </Link>
            {/* Outside the link: no control nested in another. */}
            <div className="media-card__action">
              <EpisodeDownloadButton
                slug={anime.slug}
                title={anime.title}
                episodeNumber={episode.number}
              />
            </div>
          </MediaCard>
        );
      })}
    </div>
  );
}
