import { Card } from "@heroui/react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { components } from "@/lib/api/generated";
import { formatEpisodeNumber, formatRelativeTime } from "@/lib/format";
import { AnimeImage } from "../anime-image";
import { MediaCard } from "../media-card";
import { EpisodeDownloadButton } from "../downloads/episode-download-button";

type RecentEpisode = components["schemas"]["RecentEpisodeDto"];

// Columns keep the 220px source screenshots close to their native size. Below
// 400px each card becomes a horizontal row. Rows of 3 or 6 drop the last two
// (oldest) of the 20 episodes so the grid never ends with an orphan row.
export const RECENT_GRID_CLASS =
  "grid grid-cols-1 gap-x-4 gap-y-6 max-[25rem]:gap-y-3 min-[25rem]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 min-[90rem]:grid-cols-5 min-[112.5rem]:grid-cols-6 sm:max-lg:[&>:nth-child(n+19)]:hidden min-[112.5rem]:[&>:nth-child(n+19)]:hidden";

// Below 400px the card is a row: thumbnail and text (the link), then the
// download button in its own column, like the anime page's compact rows.
const cardClass =
  "touch-card group relative min-w-0 gap-0 rounded-xl bg-surface p-0 transition-shadow duration-300 hover:shadow-[0_18px_42px_rgba(0,0,0,.3)] has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-focus has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-background max-[25rem]:[&>.media-card-clip]:flex max-[25rem]:[&>.media-card-clip]:items-center";

// The thumbnail is 9rem wide in the horizontal (<400px) layout.
const mediaClass =
  "relative aspect-[16/9] overflow-hidden bg-surface max-[25rem]:w-36 max-[25rem]:shrink-0";

export function RecentEpisodes({ episodes }: { episodes: RecentEpisode[] }) {
  if (episodes.length === 0) {
    return (
      <section
        aria-labelledby="recent-episodes-empty-title"
        className="grid min-h-56 place-items-center border-y border-white/8 py-10 text-center"
      >
        <div className="max-w-md">
          <span
            aria-hidden="true"
            className="mx-auto block h-px w-10 bg-brand"
          />
          <h3
            className="mt-5 font-display text-xl font-semibold tracking-tight text-foreground"
            id="recent-episodes-empty-title"
          >
            Aún no hay episodios recientes
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            Consulta el horario para ver qué series publican hoy.
          </p>
          <Link
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent-soft px-5 text-sm font-semibold text-accent-soft-foreground transition-colors hover:bg-accent-soft-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            href="/horario"
          >
            Ver horario
            <ArrowRight aria-hidden="true" size={15} />
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className={RECENT_GRID_CLASS}>
      {episodes.map(({ anime, episode }) => {
        const number = formatEpisodeNumber(episode.number);
        const published = episode.publishedAt
          ? formatRelativeTime(episode.publishedAt)
          : null;
        const label = [
          anime.title,
          `episodio ${number}${episode.title ? `: ${episode.title}` : ""}`,
          published,
        ]
          .filter(Boolean)
          .join(", ");
        return (
          <MediaCard className={cardClass} key={episode.id}>
            <Link
              href={`/anime/${anime.slug}`}
              aria-label={label}
              // The relative time can tick between server render and hydration.
              suppressHydrationWarning
              className="block min-w-0 outline-none max-[25rem]:flex max-[25rem]:flex-1 max-[25rem]:items-center"
            >
              <div
                className={`touch-static-media ${mediaClass} [&_.anime-image_img]:transition-transform [&_.anime-image_img]:duration-700 [&_.anime-image_img]:ease-[cubic-bezier(.22,1,.36,1)] group-hover:[&_.anime-image_img]:scale-[1.04] group-has-[a:focus-visible]:[&_.anime-image_img]:scale-[1.04]`}
              >
                <AnimeImage
                  src={episode.imageUrl}
                  fallbackSrc={anime.backdropUrl ?? anime.posterUrl}
                  alt=""
                  sizes="(max-width: 399px) 144px, (max-width: 1023px) 33vw, 20vw"
                />
                <div className="touch-hover-overlay absolute inset-0 bg-background/0 transition-colors duration-500 group-hover:bg-background/25" />
                <div
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 flex h-7 items-center rounded-tr-lg bg-surface px-3 text-[10px] font-bold"
                >
                  <span className="tracking-[.14em] text-link">EP</span>
                  <strong className="ml-1.5 tabular-nums text-foreground">
                    {number}
                  </strong>
                </div>
              </div>
              <Card.Content className="min-w-0 gap-1 px-3.5 py-3 max-[25rem]:flex-1 max-[25rem]:px-3 max-[25rem]:py-2">
                <Card.Title className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">
                  {anime.title}
                </Card.Title>
                <Card.Description className="flex min-w-0 gap-1 text-xs text-muted">
                  {episode.title ? (
                    <span className="min-w-0 truncate">{episode.title}</span>
                  ) : null}
                  {episode.title && published ? <span>·</span> : null}
                  {published ? (
                    <time
                      className="shrink-0"
                      dateTime={episode.publishedAt ?? undefined}
                      suppressHydrationWarning
                    >
                      {published}
                    </time>
                  ) : null}
                  {!episode.title && !published ? (
                    <span>Episodio {number}</span>
                  ) : null}
                </Card.Description>
              </Card.Content>
            </Link>
            {/* Outside the link (no nested controls). Centered on hover with a
              mouse; pinned to the thumbnail's top-right corner on touch,
              clear of the EP badge; its own column in the <400px rows. */}
            <div
              className={`recent-download-slot pointer-events-none absolute left-0 top-0 z-20 grid aspect-[16/9] w-full place-items-center [@media(hover:none)]:items-start [@media(hover:none)]:justify-items-end [@media(hover:none)]:p-1.5 [html[data-device=portable]_&]:items-start [html[data-device=portable]_&]:justify-items-end [html[data-device=portable]_&]:p-1.5 max-[25rem]:static max-[25rem]:!flex max-[25rem]:aspect-auto max-[25rem]:w-auto max-[25rem]:shrink-0 max-[25rem]:!items-center max-[25rem]:!p-0 max-[25rem]:pr-2`}
            >
              <EpisodeDownloadButton
                slug={anime.slug}
                title={anime.title}
                episodeNumber={episode.number}
                className="pointer-events-auto scale-90 opacity-0 transition-[opacity,scale,background-color] duration-200 group-hover:scale-100 group-hover:opacity-100 focus-visible:scale-100 focus-visible:opacity-100 [@media(hover:none)]:scale-100 [@media(hover:none)]:opacity-100 max-[25rem]:mr-2 max-[25rem]:scale-100 max-[25rem]:opacity-100"
              />
            </div>
          </MediaCard>
        );
      })}
    </div>
  );
}

// 12 placeholders fill whole rows at 1, 2, 3, 4 and 6 columns; the
// 5-column layout shows 10.
export function RecentEpisodesSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div
      className={`${RECENT_GRID_CLASS} min-[90rem]:max-[112.5rem]:[&>:nth-child(n+11)]:hidden`}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="min-w-0 overflow-hidden rounded-xl bg-surface max-[25rem]:flex max-[25rem]:items-center"
        >
          <div className={mediaClass}>
            <span className="image-skeleton" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2 px-3.5 py-3.5">
            <span className="h-3.5 w-4/5 rounded bg-surface-tertiary" />
            <span className="h-3 w-1/3 rounded bg-surface-tertiary/70" />
          </div>
        </div>
      ))}
    </div>
  );
}
