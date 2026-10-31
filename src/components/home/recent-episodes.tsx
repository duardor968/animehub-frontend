import Link from "next/link";
import type { components } from "@/lib/api/generated";
import { formatEpisodeNumber, formatRelativeTime } from "@/lib/format";
import { AnimeImage } from "../anime-image";
import { episodeAnchor, isRunning } from "../anime/anime-detail";
import { EpisodeDownloadButton } from "../downloads/episode-download-button";
import {
  MediaCard,
  MediaCardBody,
  MediaCardLabel,
  MediaCardMedia,
} from "../media-card";
import { POSTER_GRID_CLASS, POSTER_GRID_SIZES } from "../poster-grid";

type RecentEpisode = components["schemas"]["RecentEpisodeDto"];

/** Consecutive episodes of one anime, next to each other in the list, make
 *  one card; the first one (the newest) stands for them. */
export function groupRecentEpisodes(episodes: RecentEpisode[]) {
  const groups: { latest: RecentEpisode; numbers: number[] }[] = [];
  for (const entry of episodes) {
    const last = groups.at(-1);
    if (
      last &&
      last.latest.anime.id === entry.anime.id &&
      Math.abs(last.numbers.at(-1)! - entry.episode.number) === 1
    )
      last.numbers.push(entry.episode.number);
    else groups.push({ latest: entry, numbers: [entry.episode.number] });
  }
  return groups;
}

/** The anime's page that lists the episode, scrolled to it: a running
 *  series lists the newest first, any other one does so when asked. */
export function recentEpisodeHref({ anime, episode }: RecentEpisode) {
  const order = isRunning(anime.status) ? "" : "?orden=recientes";
  return `/anime/${anime.slug}${order}#${episodeAnchor(episode.number)}`;
}

export function RecentEpisodes({ episodes }: { episodes: RecentEpisode[] }) {
  return (
    <div className={POSTER_GRID_CLASS}>
      {groupRecentEpisodes(episodes).map(({ latest, numbers }) => {
        const { anime, episode } = latest;
        const first = Math.min(...numbers);
        const last = Math.max(...numbers);
        const number =
          first === last
            ? formatEpisodeNumber(first)
            : `${formatEpisodeNumber(first)}–${formatEpisodeNumber(last)}`;
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
        // A group's title would name only one of its episodes.
        const episodeTitle = numbers.length === 1 ? episode.title : null;
        return (
          <MediaCard key={episode.id}>
            <Link
              href={recentEpisodeHref(latest)}
              prefetch={false}
              aria-label={[
                anime.title,
                `${numbers.length > 1 ? "episodios" : "episodio"} ${number}${episodeTitle ? `: ${episodeTitle}` : ""}`,
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
                  episodeTitle && published ? (
                    <span className="flex gap-1">
                      <span className="truncate">{episodeTitle}</span>·
                      {published}
                    </span>
                  ) : (
                    (episodeTitle ?? published)
                  )
                }
              />
            </Link>
            {/* Outside the link: no control nested in another. */}
            <div className="media-card__action">
              <EpisodeDownloadButton
                slug={anime.slug}
                title={anime.title}
                episodeNumber={first}
                lastNumber={last}
              />
            </div>
          </MediaCard>
        );
      })}
    </div>
  );
}
