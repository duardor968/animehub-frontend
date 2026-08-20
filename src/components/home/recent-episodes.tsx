import { Card } from "@heroui/react";
import Link from "next/link";
import type { components } from "@/lib/api/generated";
import { formatEpisodeNumber, formatRelativeTime } from "@/lib/format";
import { AnimeImage } from "../anime-image";
import { EpisodeDownloadButton } from "../downloads/episode-download-button";

type RecentEpisode = components["schemas"]["RecentEpisodeDto"];

export function RecentEpisodes({ episodes }: { episodes: RecentEpisode[] }) {
  return (
    <div className="grid grid-cols-4 gap-x-4 gap-y-6 max-lg:grid-cols-2">
      {episodes.map(({ anime, episode }) => (
        <Card
          className="touch-card group relative min-w-0 gap-0 overflow-hidden rounded-xl bg-[#0A1424] p-0 transition-shadow duration-300 hover:shadow-[0_18px_42px_rgba(0,0,0,.3)]"
          key={episode.id}
        >
          <Link
            href={`/anime/${anime.slug}`}
            className="block min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-[#5B9CFF] focus-visible:ring-inset"
            aria-label={`${anime.title}, episodio ${episode.number}`}
          >
            <div className="touch-static-media relative aspect-[16/9] overflow-hidden bg-[#0A1220] [&_.anime-image_img]:transition-transform [&_.anime-image_img]:duration-700 [&_.anime-image_img]:ease-[cubic-bezier(.22,1,.36,1)] group-hover:[&_.anime-image_img]:scale-[1.04]">
              <AnimeImage
                src={episode.imageUrl}
                fallbackSrc={anime.backdropUrl ?? anime.posterUrl}
                alt={`Fotograma del episodio ${episode.number} de ${anime.title}`}
                sizes="(max-width: 700px) 92vw, (max-width: 1100px) 45vw, 23vw"
              />
              <div className="touch-hover-overlay absolute inset-0 bg-[#030812]/0 transition-colors duration-500 group-hover:bg-[#030812]/25" />
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#050A11]/92 to-transparent" />
              <div className="absolute bottom-0 left-0 flex h-7 items-center rounded-tr-lg bg-[#0A1424] px-3 text-[10px] font-bold">
                <span className="tracking-[.14em] text-[#69A7FF]">EP</span>
                <strong className="ml-1.5 tabular-nums text-[#F3F8FC]">
                  {formatEpisodeNumber(episode.number)}
                </strong>
              </div>
              <time
                className="absolute bottom-3 right-3 text-[11px] font-medium text-[#DDE7EE]"
                dateTime={episode.publishedAt ?? undefined}
              >
                {formatRelativeTime(episode.publishedAt)}
              </time>
            </div>
            <Card.Content className="gap-1 px-3.5 py-3">
              <Card.Title className="truncate text-sm font-semibold text-[#F3F8FC]">
                {anime.title}
              </Card.Title>
              <Card.Description className="truncate text-xs text-[#93A4B8]">
                {episode.title ||
                  `Episodio ${formatEpisodeNumber(episode.number)}`}
              </Card.Description>
            </Card.Content>
          </Link>
          <div className="recent-download-slot pointer-events-none absolute inset-x-0 top-0 z-20 grid aspect-[16/9] place-items-center">
            <EpisodeDownloadButton
              slug={anime.slug}
              title={anime.title}
              episodeNumber={episode.number}
              className="pointer-events-auto scale-90 opacity-0 transition-[opacity,transform,background-color] duration-200 group-hover:scale-100 group-hover:opacity-100 focus-visible:scale-100 focus-visible:opacity-100 [@media(hover:none)]:scale-100 [@media(hover:none)]:opacity-100"
            />
          </div>
        </Card>
      ))}
    </div>
  );
}
