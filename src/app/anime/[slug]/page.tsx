import { Typography } from "@heroui/react";
import {
  CalendarDays,
  ExternalLink,
  Film,
  ListVideo,
  ShieldAlert,
  Star,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { AnimeImage } from "@/components/anime-image";
import { ButtonLink } from "@/components/button-link";
import { pageMainClass } from "@/components/page-header";
import {
  MediaCard,
  MediaCardBody,
  MediaCardLabel,
  MediaCardMedia,
  MediaCardOverlay,
} from "@/components/media-card";
import {
  EpisodeBrowser,
  MovieDownloadButton,
} from "@/components/anime/episode-browser";
import {
  isSameTitle,
  MAX_EPISODE_PAGE,
  parseEpisodePage,
  summarize,
} from "@/components/anime/anime-detail";
import { ExpandableSynopsis } from "@/components/anime/expandable-synopsis";
import { RelatedScroller } from "@/components/anime/related-scroller";
import { loadAnime } from "@/lib/api/anime";
import {
  ApiResponseError,
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

const scoreFormatter = new Intl.NumberFormat("es", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const yearOf = (date: string | null | undefined) =>
  date ? new Date(date).getUTCFullYear() : null;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const response = await getAnime(slug);
  // Unknown slug: the page answers 404 and Next adds the noindex itself.
  if (!response) return { title: "Anime no encontrado" };
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
  // Clamped to the API's maximum: a larger page is past the end of any anime
  // and redirects to the last page below (the API would answer 400).
  const requestedPage = parseEpisodePage(
    Array.isArray(rawPage) ? rawPage[0] : rawPage,
    MAX_EPISODE_PAGE,
  );
  const episodes = await apiFetch<EpisodePageResponse>(
    `/anime/${encodeURIComponent(slug)}/episodes?page=${requestedPage}`,
  ).catch((error: unknown) => {
    if (isApiNotFoundError(error)) notFound();
    // Any other rejected page number: the list from the start, never a 500.
    if (
      error instanceof ApiResponseError &&
      error.status === 400 &&
      requestedPage > 1
    )
      redirect(`/anime/${anime.slug}#episodios`);
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
  // A movie is downloaded from its header, without an episode list.
  const movieEpisode =
    isMovie(anime) && totalRecords === 1 ? episodes.data[0] : undefined;
  const showAlternative =
    anime.alternativeTitle && !isSameTitle(anime.alternativeTitle, anime.title);
  // No aggregateRating: the score comes from another site, and Google's
  // review snippet rules forbid ratings aggregated from elsewhere.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": isMovie(anime) ? "Movie" : "TVSeries",
    name: anime.title,
    alternateName: showAlternative ? anime.alternativeTitle : undefined,
    description: anime.synopsis,
    image: anime.posterUrl,
    url: `${siteUrl}/anime/${anime.slug}`,
    genre: anime.genres.map((genre) => genre.name),
    [isMovie(anime) ? "datePublished" : "startDate"]: anime.startDate?.slice(
      0,
      10,
    ),
    numberOfEpisodes: isMovie(anime)
      ? undefined
      : (anime.episodeCount ?? undefined),
  };
  const year = yearOf(anime.startDate);
  const synopsis = anime.synopsis?.trim();

  return (
    <main id={MAIN_CONTENT_ID} tabIndex={-1} className={pageMainClass}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      {/* Phones: poster and title side by side, the rest below. */}
      <header className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:grid-rows-[auto_1fr] sm:gap-x-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-surface sm:row-span-2">
          <AnimeImage
            src={anime.posterUrl}
            alt={`Póster de ${anime.title}`}
            priority
            sizes="(max-width: 639px) 112px, (max-width: 1023px) 192px, 240px"
          />
        </div>
        <div className="min-w-0 self-center sm:self-start">
          <Typography type="h1" className="text-balance break-words">
            {anime.title}
          </Typography>
          {showAlternative && (
            <p className="mt-2 text-sm break-words text-muted">
              {anime.alternativeTitle}
            </p>
          )}
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2">
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted [&>li]:inline-flex [&>li]:items-center [&>li]:gap-1.5">
            {anime.status !== "UNKNOWN" && (
              <li className={anime.status === "AIRING" ? "text-success" : ""}>
                {formatStatus(anime.status)}
              </li>
            )}
            {typeof anime.score === "number" && anime.score > 0 && (
              <li>
                <Star size={14} fill="currentColor" aria-hidden="true" />
                <span className="sr-only">Puntuación:</span>
                <span className="text-foreground">
                  {scoreFormatter.format(anime.score)}
                </span>
                {anime.votes ? `(${plural(anime.votes, "voto", "votos")})` : ""}
              </li>
            )}
            {year && (
              <li>
                <CalendarDays size={14} aria-hidden="true" />
                {year}
              </li>
            )}
            {anime.category && (
              <li>
                <Film size={14} aria-hidden="true" />
                {anime.category.name}
              </li>
            )}
            {!movieEpisode && totalRecords > 0 && (
              <li>
                <ListVideo size={14} aria-hidden="true" />
                {plural(totalRecords, "episodio", "episodios")}
              </li>
            )}
            {anime.mature && (
              <li className="text-warning">
                <ShieldAlert size={14} aria-hidden="true" />
                Contenido sensible
              </li>
            )}
          </ul>
          {anime.genres.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Géneros">
              {anime.genres.map((genre) => (
                <li key={genre.id}>
                  <ButtonLink
                    href={`/catalogo?genre=${genre.slug}`}
                    prefetch={false}
                    variant="tertiary"
                    size="sm"
                  >
                    {genre.name}
                  </ButtonLink>
                </li>
              ))}
            </ul>
          )}
          {synopsis && <ExpandableSynopsis text={synopsis} />}
          <div className="mt-6 flex flex-wrap gap-3">
            {movieEpisode && (
              <MovieDownloadButton
                slug={anime.slug}
                title={anime.title}
                episodeNumber={movieEpisode.number}
              />
            )}
            {anime.trailerUrl && (
              <ExternalButtonLink href={anime.trailerUrl} variant="secondary">
                Ver tráiler
              </ExternalButtonLink>
            )}
            <ExternalButtonLink href={anime.sourceUrl} variant="tertiary">
              Ficha original
            </ExternalButtonLink>
          </div>
        </div>
      </header>
      <div className="mt-8 flex flex-col gap-12">
        {anime.relations.length > 0 && <RelatedAnime anime={anime} />}
        {!movieEpisode && (
          <EpisodeBrowser
            slug={anime.slug}
            title={anime.title}
            posterUrl={anime.posterUrl}
            backdropUrl={anime.backdropUrl}
            initial={episodes.data}
            initialPage={requestedPage}
            totalRecords={totalRecords}
            // Range bounds come from the whole anime (a special can be 0).
            firstNumber={episodes.meta.firstNumber ?? 1}
            lastNumber={
              episodes.meta.lastNumber ?? episodes.meta.firstNumber ?? 1
            }
            nextEpisodeAt={anime.nextEpisodeAt}
          />
        )}
      </div>
    </main>
  );
}

function ExternalButtonLink({
  href,
  variant,
  children,
}: {
  href: string;
  variant: "secondary" | "tertiary";
  children: string;
}) {
  return (
    <ButtonLink
      href={href}
      variant={variant}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <ExternalLink size={16} aria-hidden="true" />
      <span className="sr-only">(se abre en otra pestaña)</span>
    </ButtonLink>
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
  // The source's generic link (One Piece has 22): on every card it is noise.
  OTHER: null,
};

const POSTER_SIZES = "(min-width: 1024px) 192px, 160px";

/** Related anime and this one, in release order (undated ones last). */
function RelatedAnime({ anime }: { anime: AnimeDetail }) {
  const time = (date?: string | null) =>
    date ? new Date(date).getTime() : Number.POSITIVE_INFINITY;
  const entries = [
    ...anime.relations.map((relation) => ({
      key: `${relation.kind}-${relation.anime.slug}`,
      time: time(relation.anime.startDate),
      relation,
    })),
    { key: "current", time: time(anime.startDate), relation: null },
  ].sort((a, b) => a.time - b.time);

  return (
    <RelatedScroller title="Relacionados">
      {entries.map(({ key, relation }, index) => {
        // The first posters show in the first viewport (on phones, one of
        // them is the largest image).
        const loading = index < 6 ? "eager" : "lazy";
        return (
          <li key={key} className="w-40 shrink-0 snap-start lg:w-48">
            {relation ? (
              <RelatedCard relation={relation} loading={loading} />
            ) : (
              <CurrentCard anime={anime} loading={loading} />
            )}
          </li>
        );
      })}
    </RelatedScroller>
  );
}

const factsOf = (anime: Pick<AnimeDetail, "startDate" | "category">) =>
  [yearOf(anime.startDate), anime.category?.name].filter(Boolean).join(" · ");

type ImageLoading = "eager" | "lazy";

function RelatedCard({
  relation,
  loading,
}: {
  relation: Relation;
  loading: ImageLoading;
}) {
  const { anime } = relation;
  const label = RELATION_LABELS[relation.kind];
  const synopsis = anime.synopsis?.trim();
  return (
    <MediaCard className="h-full">
      <Link
        href={`/anime/${anime.slug}`}
        prefetch={false}
        aria-label={[anime.title, label, yearOf(anime.startDate)]
          .filter(Boolean)
          .join(", ")}
        className="flex flex-1 flex-col outline-none"
      >
        <MediaCardMedia aspect="poster">
          <AnimeImage
            src={anime.posterUrl}
            alt=""
            sizes={POSTER_SIZES}
            loading={loading}
          />
          {synopsis && (
            <MediaCardOverlay>
              <p className="line-clamp-8 text-xs leading-5 text-subtle">
                {synopsis}
              </p>
            </MediaCardOverlay>
          )}
          {label && <MediaCardLabel>{label}</MediaCardLabel>}
        </MediaCardMedia>
        <MediaCardBody title={anime.title} meta={factsOf(anime)} />
      </Link>
    </MediaCard>
  );
}

function CurrentCard({
  anime,
  loading,
}: {
  anime: AnimeDetail;
  loading: ImageLoading;
}) {
  return (
    <MediaCard className="h-full" aria-current="page">
      <MediaCardMedia aspect="poster">
        <AnimeImage
          src={anime.posterUrl}
          alt=""
          sizes={POSTER_SIZES}
          loading={loading}
        />
        <MediaCardLabel tone="accent">Este anime</MediaCardLabel>
      </MediaCardMedia>
      <MediaCardBody title={anime.title} meta={factsOf(anime)} />
    </MediaCard>
  );
}
