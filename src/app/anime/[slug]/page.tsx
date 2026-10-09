import { Card } from "@heroui/react";
import {
  CalendarDays,
  ExternalLink,
  Film,
  ShieldAlert,
  Star,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { AnimeImage } from "@/components/anime-image";
import { MediaCard } from "@/components/media-card";
import { EpisodeBrowser } from "@/components/anime/episode-browser";
import {
  isSameTitle,
  parseEpisodePage,
  summarize,
} from "@/components/anime/anime-detail";
import { ExpandableSynopsis } from "@/components/anime/expandable-synopsis";
import { RelatedScroller } from "@/components/anime/related-scroller";
import { loadAnime } from "@/lib/api/anime";
import {
  apiFetch,
  isApiNotFoundError,
  type AnimeResponse,
  type EpisodePageResponse,
} from "@/lib/api/client";
import { formatStatus, plural } from "@/lib/format";
import { MAIN_CONTENT_ID } from "@/lib/navigation";
import { siteOpenGraph, siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

type AnimeDetail = AnimeResponse["data"];
type Relation = AnimeDetail["relations"][number];

// generateMetadata and the page share one API request per render.
const getAnime = cache((slug: string) => loadAnime(slug));

const isMovie = (anime: Pick<AnimeDetail, "category">) =>
  anime.category?.slug === "pelicula";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const response = await getAnime(slug);
  if (!response)
    return { title: "Anime no encontrado", robots: { index: false } };
  const anime = response.data;
  const description = anime.synopsis?.trim()
    ? summarize(anime.synopsis)
    : `Episodios y descargas de ${anime.title}.`;
  const url = `/anime/${anime.slug}`;
  const image = anime.backdropUrl ?? anime.posterUrl;
  return {
    title: anime.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      ...siteOpenGraph,
      title: anime.title,
      description,
      url,
      type: isMovie(anime) ? "video.movie" : "video.tv_show",
      images: image ? [{ url: image, alt: anime.title }] : [],
    },
  };
}

export default async function AnimePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { slug } = await params;
  const response = await getAnime(slug);
  if (!response) notFound();
  const anime = response.data;
  const rawPage = (await searchParams).page;
  const requestedPage = parseEpisodePage(
    Array.isArray(rawPage) ? rawPage[0] : rawPage,
    Number.MAX_SAFE_INTEGER,
  );
  const episodes = await apiFetch<EpisodePageResponse>(
    `/anime/${encodeURIComponent(slug)}/episodes?page=${requestedPage}`,
  ).catch((error: unknown) => {
    if (isApiNotFoundError(error)) notFound();
    throw error;
  });
  const { totalRecords, totalPages } = episodes.meta;
  if (requestedPage > 1 && requestedPage > totalPages) {
    redirect(
      totalPages > 1
        ? `/anime/${anime.slug}?page=${totalPages}#episodios`
        : `/anime/${anime.slug}#episodios`,
    );
  }
  // Range limits come from the whole anime (a movie can be episode 0).
  const firstNumber = episodes.meta.firstNumber ?? 1;
  const lastNumber = episodes.meta.lastNumber ?? firstNumber;
  const movie = isMovie(anime);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": movie ? "Movie" : "TVSeries",
    name: anime.title,
    description: anime.synopsis,
    image: anime.posterUrl,
    url: `${siteUrl}/anime/${anime.slug}`,
  };
  const year = anime.startDate
    ? new Date(anime.startDate).getUTCFullYear()
    : null;
  // The API returns genres sorted by name.
  const genres = anime.genres;
  const showAlternative =
    anime.alternativeTitle && !isSameTitle(anime.alternativeTitle, anime.title);
  const rated = typeof anime.score === "number" && anime.score > 0;

  return (
    <main id={MAIN_CONTENT_ID} tabIndex={-1} className="outline-none">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <section className="relative overflow-hidden border-b border-white/6 bg-background">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,color-mix(in_srgb,var(--brand)_11%,transparent),transparent_34%)]"
          aria-hidden="true"
        />
        <div className="page-container relative grid grid-cols-[minmax(270px,330px)_minmax(0,1fr)] grid-rows-[auto_1fr] items-start gap-x-[clamp(2.5rem,6vw,6.5rem)] py-14 max-lg:grid-cols-[240px_minmax(0,1fr)] max-lg:gap-x-10 max-md:grid-cols-[190px_minmax(0,1fr)] max-md:gap-x-6 max-md:py-10 max-sm:grid-cols-[112px_minmax(0,1fr)] max-sm:grid-rows-none max-sm:gap-x-4 max-sm:py-6">
          <div className="relative row-span-2 aspect-[2/3] overflow-hidden rounded-[1.35rem] bg-surface shadow-[0_28px_84px_rgb(0_0_0/0.48)] max-sm:row-span-1 max-sm:self-start max-sm:rounded-xl">
            <AnimeImage
              src={anime.posterUrl}
              alt={`Póster de ${anime.title}`}
              priority
              sizes="(max-width: 639px) 112px, (max-width: 1023px) 240px, 330px"
            />
          </div>
          <div className="min-w-0 max-sm:self-center">
            <span className="eyebrow">
              {movie ? "Película" : "Ficha de anime"}
            </span>
            <h1 className="mt-3 max-w-[1020px] font-display text-[clamp(2.65rem,5vw,5.2rem)] font-semibold leading-[.98] tracking-[-.055em] text-foreground [overflow-wrap:anywhere] max-md:text-[clamp(2.25rem,5.8vw,3.7rem)] max-sm:mt-1.5 max-sm:line-clamp-4 max-sm:text-[1.75rem] max-sm:leading-[1.05] max-sm:tracking-[-.04em]">
              {anime.title}
            </h1>
            {showAlternative && (
              <p
                className="mt-3 line-clamp-2 max-w-[900px] text-sm italic leading-6 text-muted max-sm:mt-1.5 max-sm:text-xs max-sm:leading-5"
                title={anime.alternativeTitle ?? undefined}
              >
                {anime.alternativeTitle}
              </p>
            )}
          </div>
          <div className="col-start-2 min-w-0 max-sm:col-span-2 max-sm:col-start-1">
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 border-y border-white/8 py-3.5 text-xs font-medium text-subtle max-sm:mt-5 [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1.5">
              {anime.status !== "UNKNOWN" && (
                <span>
                  {anime.status === "AIRING" && (
                    <i
                      className="relative mr-1 inline-flex size-2.5 items-center justify-center"
                      aria-hidden="true"
                    >
                      <i className="absolute inset-0 animate-ping rounded-full bg-success/45 motion-reduce:hidden" />
                      <i className="relative inline-flex size-1.5 rounded-full bg-success" />
                    </i>
                  )}
                  {formatStatus(anime.status)}
                </span>
              )}
              {rated && (
                <span>
                  <Star size={14} fill="currentColor" aria-hidden="true" />
                  <span className="sr-only">Puntuación:</span>
                  {anime.score?.toLocaleString("es", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  {anime.votes ? (
                    <small className="text-[11px] text-muted">
                      ({plural(anime.votes, "voto", "votos")})
                    </small>
                  ) : null}
                </span>
              )}
              {year && (
                <span>
                  <CalendarDays size={14} aria-hidden="true" />
                  {year}
                </span>
              )}
              {anime.category && (
                <span>
                  <Film size={14} aria-hidden="true" /> {anime.category.name}
                </span>
              )}
              {anime.episodeCount && !movie ? (
                <span>
                  {plural(anime.episodeCount, "episodio", "episodios")}
                </span>
              ) : null}
              {anime.mature && (
                <span className="text-warning">
                  <ShieldAlert size={14} aria-hidden="true" /> Contenido
                  sensible
                </span>
              )}
            </div>
            {genres.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Géneros">
                {genres.map((genre) => (
                  <li key={genre.id}>
                    <Link
                      className="inline-flex min-h-8 items-center rounded-full bg-default/82 px-3 text-xs font-medium text-subtle outline-none transition-colors hover:bg-default-hover hover:text-link focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background [@media(pointer:coarse)]:min-h-11"
                      href={`/catalogo?genre=${genre.slug}`}
                    >
                      {genre.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {anime.synopsis?.trim() && (
              <ExpandableSynopsis
                text={anime.synopsis.trim()}
                className="mt-5"
              />
            )}
            <div className="mt-6 flex flex-wrap gap-3 max-sm:mt-4">
              {anime.trailerUrl && (
                <a
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-6 text-sm font-semibold text-accent-foreground shadow-lg shadow-accent/25 outline-none transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  href={anime.trailerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ver tráiler <ExternalLink size={14} aria-hidden="true" />
                  <span className="sr-only">(se abre en otra pestaña)</span>
                </a>
              )}
              <a
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-6 text-sm font-semibold text-foreground outline-none backdrop-blur-md transition-colors hover:bg-white/16 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                href={anime.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ficha original <ExternalLink size={14} aria-hidden="true" />
                <span className="sr-only">(se abre en otra pestaña)</span>
              </a>
            </div>
          </div>
        </div>
      </section>
      <div className="page-container flex flex-col gap-16 pt-12 pb-[calc(var(--bottom-nav-clearance)+var(--download-dock-height,0px)+3rem)]">
        {anime.relations.length > 0 && (
          <RelatedAnime
            relations={anime.relations}
            current={{ title: anime.title, posterUrl: anime.posterUrl, year }}
          />
        )}
        <EpisodeBrowser
          slug={anime.slug}
          title={anime.title}
          posterUrl={anime.posterUrl}
          backdropUrl={anime.backdropUrl}
          initial={episodes.data}
          initialPage={requestedPage}
          totalRecords={totalRecords}
          firstNumber={firstNumber}
          lastNumber={lastNumber}
          isMovie={movie}
          nextEpisodeAt={anime.nextEpisodeAt}
        />
      </div>
    </main>
  );
}

const RELATION_LABELS: Record<Relation["kind"], string | null> = {
  PREQUEL: "Precuela",
  SEQUEL: "Secuela",
  MAIN_STORY: "Historia principal",
  FULL_STORY: "Historia completa",
  SIDE_STORY: "Historia paralela",
  SPIN_OFF: "Spin-off",
  SUMMARY: "Resumen",
  ALTERNATIVE: "Versión alternativa",
  ALTERNATIVE_SETTING: "Ambientación alternativa",
  // "Otro" is the source's generic link (One Piece has 22): repeating it on
  // every card adds noise, so those cards show no relation label.
  OTHER: null,
};

const yearOf = (date: string | null | undefined) =>
  date ? new Date(date).getUTCFullYear() : null;

// A year timeline: each year heads a column with its axis line running to the
// right (like the source's histogram-style axis). Cards reuse the catalog
// treatment — relation badge and a hover overlay with the synopsis — sized
// down for the row. The current anime is marked in its own year.
function RelatedAnime({
  relations,
  current,
}: {
  relations: Relation[];
  current: { title: string; posterUrl?: string | null; year: number | null };
}) {
  type Entry = { kind: "relation"; relation: Relation } | { kind: "current" };
  const groups = new Map<number | null, Entry[]>();
  const push = (year: number | null, entry: Entry) => {
    const bucket = groups.get(year);
    if (bucket) bucket.push(entry);
    else groups.set(year, [entry]);
  };
  for (const relation of relations)
    push(yearOf(relation.anime.startDate), { kind: "relation", relation });
  if (current.year !== null) push(current.year, { kind: "current" });
  const columns = [...groups.entries()].sort(([a], [b]) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  });

  return (
    <section aria-labelledby="relacionados-titulo">
      <span className="eyebrow">Cronología</span>
      <h2
        id="relacionados-titulo"
        className="mt-1 mb-6 font-display text-3xl font-semibold tracking-tight text-foreground"
      >
        Relacionados
      </h2>
      <RelatedScroller label="Anime relacionados">
        <ol className="flex min-w-max items-start gap-3 pt-1">
          {columns.map(([year, items]) => (
            <li key={year ?? "sin-fecha"} className="flex flex-col gap-3.5">
              <div className="flex items-center gap-2.5" aria-hidden="true">
                <span className="font-display text-lg font-semibold tabular-nums text-muted">
                  {year ?? "Sin fecha"}
                </span>
                <span className="h-px flex-1 bg-white/12" />
              </div>
              <ul
                className="flex gap-3"
                aria-label={year ? String(year) : "Sin fecha"}
              >
                {items.map((entry) =>
                  entry.kind === "current" ? (
                    <li key="current">
                      <CurrentCard
                        title={current.title}
                        posterUrl={current.posterUrl}
                      />
                    </li>
                  ) : (
                    <li
                      key={`${entry.relation.kind}-${entry.relation.anime.slug}`}
                    >
                      <RelatedCard relation={entry.relation} />
                    </li>
                  ),
                )}
              </ul>
            </li>
          ))}
        </ol>
      </RelatedScroller>
    </section>
  );
}

function RelatedCard({ relation }: { relation: Relation }) {
  const label = RELATION_LABELS[relation.kind];
  const year = yearOf(relation.anime.startDate);
  const meta = [year, relation.anime.category?.name]
    .filter(Boolean)
    .join(" · ");
  return (
    <MediaCard className="touch-card group w-[152px] min-w-0 shrink-0 gap-0 rounded-xl bg-surface p-0 outline-offset-2 outline-focus transition-shadow duration-300 hover:shadow-[0_18px_42px_rgb(0_0_0/0.3)] has-[a:focus-visible]:outline-2">
      <Link
        href={`/anime/${relation.anime.slug}`}
        aria-label={[relation.anime.title, label, year]
          .filter(Boolean)
          .join(", ")}
        className="block outline-none"
      >
        <div className="touch-static-media relative aspect-[2/3] overflow-hidden bg-surface [&_.anime-image_img]:transition-transform [&_.anime-image_img]:duration-700 [&_.anime-image_img]:ease-[cubic-bezier(.22,1,.36,1)] group-hover:[&_.anime-image_img]:scale-[1.04] group-has-[:focus-visible]:[&_.anime-image_img]:scale-[1.04]">
          <AnimeImage src={relation.anime.posterUrl} alt="" sizes="152px" />
          {label && (
            <span className="touch-category-label absolute bottom-0 left-0 rounded-tr-lg bg-surface px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[.08em] text-link transition-opacity duration-300 group-hover:opacity-0 group-has-[:focus-visible]:opacity-0">
              {label}
            </span>
          )}
          {relation.anime.synopsis?.trim() ? (
            <div
              aria-hidden="true"
              className="touch-hover-panel absolute inset-0 flex flex-col justify-end bg-background-secondary/92 p-3 opacity-0 transition-opacity duration-250 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100"
            >
              <p className="line-clamp-[9] text-[11px] leading-4 text-subtle">
                {relation.anime.synopsis}
              </p>
            </div>
          ) : null}
        </div>
        <Card.Content className="gap-0.5 px-3 py-3">
          {/* Two reserved lines keep every card the same height. */}
          <Card.Title className="line-clamp-2 min-h-8 text-xs font-semibold leading-4 text-foreground">
            {relation.anime.title}
          </Card.Title>
          {meta && (
            <Card.Description className="text-[11px] leading-4 text-muted">
              {meta}
            </Card.Description>
          )}
        </Card.Content>
      </Link>
    </MediaCard>
  );
}

function CurrentCard({
  title,
  posterUrl,
}: {
  title: string;
  posterUrl?: string | null;
}) {
  return (
    <div
      className="w-[152px] shrink-0 overflow-hidden rounded-xl bg-surface ring-2 ring-brand/70"
      aria-current="page"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-surface">
        <AnimeImage src={posterUrl} alt="" sizes="152px" />
        <span className="absolute bottom-0 left-0 rounded-tr-lg bg-accent px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[.08em] text-accent-foreground">
          Este anime
        </span>
      </div>
      <div className="px-3 py-3">
        <p className="line-clamp-2 min-h-8 text-xs font-semibold leading-4 text-foreground">
          {title}
        </p>
        <p className="text-[11px] leading-4 text-muted">Estás aquí</p>
      </div>
    </div>
  );
}
