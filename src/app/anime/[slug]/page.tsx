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
import { notFound } from "next/navigation";
import { AnimeImage } from "@/components/anime-image";
import { EpisodeBrowser } from "@/components/anime/episode-browser";
import { loadAnime } from "@/lib/api/anime";
import {
  apiFetch,
  type AnimeResponse,
  type EpisodePageResponse,
} from "@/lib/api/client";
import { formatStatus } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const response = await loadAnime(slug);
  if (!response)
    return { title: "Anime no encontrado", robots: { index: false } };
  return {
    title: response.data.title,
    description:
      response.data.synopsis ??
      `Episodios y descargas de ${response.data.title}.`,
    alternates: { canonical: `/anime/${response.data.slug}` },
    openGraph: {
      title: response.data.title,
      description: response.data.synopsis ?? undefined,
      images: response.data.backdropUrl ? [response.data.backdropUrl] : [],
    },
  };
}

export default async function AnimePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const response = await loadAnime(slug);
  if (!response) notFound();
  const anime = response.data;
  const episodes = await apiFetch<EpisodePageResponse>(
    `/anime/${encodeURIComponent(slug)}/episodes?page=1`,
  );
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": anime.category?.name === "Película" ? "Movie" : "TVSeries",
    name: anime.title,
    description: anime.synopsis,
    image: anime.posterUrl,
    url: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/anime/${anime.slug}`,
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <section className="relative overflow-hidden border-b border-white/6 bg-[#050A11]">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(47,129,247,.11),transparent_34%)]"
          aria-hidden="true"
        />
        <div className="relative mx-auto grid w-full max-w-[1500px] grid-cols-[minmax(270px,330px)_minmax(0,1fr)] items-start gap-[clamp(2.5rem,6vw,6.5rem)] px-6 py-14 max-lg:grid-cols-[240px_minmax(0,1fr)] max-lg:gap-10 max-md:grid-cols-[190px_minmax(0,1fr)] max-md:gap-6 max-md:py-10 max-sm:block max-sm:px-4 max-sm:py-8">
          <div className="relative aspect-[2/3] overflow-hidden rounded-[1.35rem] bg-[#0A1220] shadow-[0_28px_84px_rgba(0,0,0,.48)] max-sm:mb-7 max-sm:w-[min(58vw,220px)]">
            <AnimeImage
              src={anime.posterUrl}
              alt={`Póster de ${anime.title}`}
              priority
              sizes="(max-width: 640px) 58vw, (max-width: 1024px) 240px, 330px"
            />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-[.2em] text-[#69A7FF]">
              Ficha de anime
            </span>
            <h1 className="mt-3 max-w-[1020px] font-(family-name:--font-display) text-[clamp(2.65rem,5vw,5.2rem)] font-semibold leading-[.98] tracking-[-.055em] text-[#F3F8FC] max-md:text-[clamp(2.25rem,5.8vw,3.7rem)]">
              {anime.title}
            </h1>
            {anime.alternativeTitle && (
              <p className="mt-3 max-w-[900px] text-sm italic leading-6 text-[#91A8BC]">
                {anime.alternativeTitle}
              </p>
            )}
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 border-y border-white/8 py-3.5 text-xs font-medium text-[#C4D2DE] [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1.5">
              <span>
                {anime.status === "AIRING" && (
                  <i
                    className="relative mr-1 inline-flex size-2.5 items-center justify-center"
                    aria-hidden="true"
                  >
                    <i className="absolute inset-0 animate-ping rounded-full bg-[#35D39B]/45" />
                    <i className="relative inline-flex size-1.5 rounded-full bg-[#35D39B] shadow-[0_0_10px_rgba(53,211,155,.72)]" />
                  </i>
                )}
                {formatStatus(anime.status)}
              </span>
              {anime.score !== null && anime.score !== undefined && (
                <span>
                  <Star size={14} fill="currentColor" />{" "}
                  {anime.score.toFixed(2)}
                  {anime.votes ? (
                    <small className="text-[#8FA3B4]">
                      {anime.votes.toLocaleString("es")} votos
                    </small>
                  ) : null}
                </span>
              )}
              {anime.startDate && (
                <span>
                  <CalendarDays size={14} />
                  {new Date(anime.startDate).getUTCFullYear()}
                </span>
              )}
              {anime.category && (
                <span>
                  <Film size={14} /> {anime.category.name}
                </span>
              )}
              {anime.episodeCount && (
                <span>{anime.episodeCount} episodios</span>
              )}
              {anime.mature && (
                <span className="text-amber-200">
                  <ShieldAlert size={14} /> Contenido sensible
                </span>
              )}
            </div>
            {anime.genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Géneros">
                {anime.genres.map((genre) => (
                  <Link
                    className="rounded-full bg-[#151E2E]/82 px-3 py-1.5 text-xs font-medium text-[#C4D2DE] transition-colors hover:bg-[#1C2940] hover:text-[#81B3FA]"
                    href={`/catalogo?genre=${genre.slug}`}
                    key={genre.id}
                  >
                    {genre.name}
                  </Link>
                ))}
              </div>
            )}
            <p className="mt-5 max-w-[920px] text-[15px] leading-7 text-[#C4D2DE]">
              {anime.synopsis}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {anime.trailerUrl && (
                <a
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#2F81F7] px-6 text-sm font-semibold text-white shadow-[0_12px_34px_rgba(47,129,247,.25)] transition-colors hover:bg-[#4B93F7]"
                  href={anime.trailerUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver tráiler <ExternalLink size={14} />
                </a>
              )}
              <a
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-6 text-sm font-semibold text-[#F3F8FC] backdrop-blur-md transition-colors hover:bg-white/16"
                href={anime.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Ficha original <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      </section>
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-16 px-6 py-12 max-sm:px-4 max-sm:pb-28">
        {anime.relations.length > 0 && (
          <RelatedAnime relations={anime.relations} />
        )}
        <EpisodeBrowser
          slug={anime.slug}
          title={anime.title}
          posterUrl={anime.posterUrl}
          backdropUrl={anime.backdropUrl}
          initial={episodes.data}
          totalRecords={episodes.meta.totalRecords}
        />
      </div>
    </main>
  );
}

const RELATION_LABELS: Record<string, string> = {
  PREQUEL: "Precuela",
  SEQUEL: "Secuela",
  MAIN_STORY: "Historia principal",
  SIDE_STORY: "Historia paralela",
  SUMMARY: "Resumen",
  ALTERNATIVE: "Versión alternativa",
  OTHER: "Otra conexión",
};

// A year timeline: each year heads a column with its axis line running to the
// right (almost touching the next year, like the source's histogram-style axis),
// and the related titles reuse the catalog card treatment — type badge, and a
// hover overlay that reveals the synopsis — just sized down for the row.
function RelatedAnime({
  relations,
}: {
  relations: AnimeResponse["data"]["relations"];
}) {
  const yearOf = (date: string | null | undefined) =>
    date ? new Date(date).getUTCFullYear() : null;
  const groups = new Map<number | null, AnimeResponse["data"]["relations"]>();
  for (const relation of relations) {
    const year = yearOf(relation.anime.startDate);
    const bucket = groups.get(year);
    if (bucket) bucket.push(relation);
    else groups.set(year, [relation]);
  }
  const columns = [...groups.entries()].sort(([a], [b]) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  });

  return (
    <section>
      <h2 className="mb-6 font-(family-name:--font-display) text-3xl font-semibold tracking-tight text-[#F3F8FC]">
        Relacionados
      </h2>
      <div className="-mx-1 overflow-x-auto px-1 pb-3 [scrollbar-width:thin]">
        <ol className="flex min-w-max items-start gap-3">
          {columns.map(([year, items]) => (
            <li key={year ?? "sin-fecha"} className="flex flex-col gap-3.5">
              {/* Year marker + axis line running right, nearly reaching the next
                  year, to read as one continuous timeline. */}
              <div className="flex items-center gap-2.5">
                <span className="font-(family-name:--font-display) text-lg font-semibold tabular-nums text-[#9FB3C6]">
                  {year ?? "Sin fecha"}
                </span>
                <span className="h-px flex-1 bg-white/12" aria-hidden="true" />
              </div>
              <div className="flex gap-3">
                {items.map((relation) => (
                  <RelatedCard
                    key={`${relation.kind}-${relation.anime.slug}`}
                    relation={relation}
                  />
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function RelatedCard({
  relation,
}: {
  relation: AnimeResponse["data"]["relations"][number];
}) {
  const label = RELATION_LABELS[relation.kind] ?? relation.kind;
  return (
    <Card className="touch-card group w-[152px] min-w-0 shrink-0 gap-0 overflow-hidden rounded-xl bg-[#0A1424] p-0 transition-shadow duration-300 hover:shadow-[0_18px_42px_rgba(0,0,0,.3)]">
      <Link
        href={`/anime/${relation.anime.slug}`}
        className="block outline-none focus-visible:ring-2 focus-visible:ring-[#5B9CFF] focus-visible:ring-inset"
      >
        <div className="touch-static-media relative aspect-[2/3] overflow-hidden bg-[#0A1220] [&_.anime-image_img]:transition-transform [&_.anime-image_img]:duration-700 [&_.anime-image_img]:ease-[cubic-bezier(.22,1,.36,1)] group-hover:[&_.anime-image_img]:scale-[1.04] group-has-[:focus-visible]:[&_.anime-image_img]:scale-[1.04]">
          <AnimeImage
            src={relation.anime.posterUrl}
            alt={relation.anime.title}
            sizes="152px"
          />
          <span className="touch-category-label absolute bottom-0 left-0 rounded-tr-lg bg-[#0A1424] px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[.08em] text-[#8AB8FA] transition-opacity duration-300 group-hover:opacity-0 group-has-[:focus-visible]:opacity-0">
            {label}
          </span>
          <div className="touch-hover-panel absolute inset-0 flex flex-col justify-end bg-[#07101D]/92 p-3 opacity-0 transition-opacity duration-250 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100">
            <span className="text-[9px] font-bold uppercase tracking-[.14em] text-[#69A7FF]">
              {label}
            </span>
            <strong className="mt-1.5 line-clamp-2 text-xs font-semibold leading-4 text-[#F3F8FC]">
              {relation.anime.title}
            </strong>
            {relation.anime.synopsis?.trim() ? (
              <p className="mt-1.5 line-clamp-5 text-[11px] leading-4 text-[#B8C6D4]">
                {relation.anime.synopsis}
              </p>
            ) : null}
          </div>
        </div>
        <Card.Content className="gap-0.5 px-3 py-3">
          {/* Reserve two lines so every card is the same height regardless of
              how long the title is (aligns the row like the catalog grid). */}
          <Card.Title className="line-clamp-2 min-h-8 text-xs font-semibold leading-4 text-[#F3F8FC]">
            {relation.anime.title}
          </Card.Title>
          <Card.Description className="text-[11px] leading-4 text-[#93A4B8]">
            {label}
          </Card.Description>
        </Card.Content>
      </Link>
    </Card>
  );
}
