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
import {
  apiFetch,
  type AnimeResponse,
  type EpisodePageResponse,
} from "@/lib/api/client";
import { formatStatus } from "@/lib/format";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  try {
    return await apiFetch<AnimeResponse>(`/anime/${encodeURIComponent(slug)}`);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const response = await load(slug);
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
  const response = await load(slug);
  if (!response) notFound();
  const anime = response.data;
  const episodes = await apiFetch<EpisodePageResponse>(
    `/anime/${encodeURIComponent(slug)}/episodes?page=1`,
  );
  const relationGroups = [
    { title: "Línea principal", kinds: ["PREQUEL", "SEQUEL"] },
    { title: "Historia principal", kinds: ["MAIN_STORY"] },
    { title: "Historias paralelas", kinds: ["SIDE_STORY"] },
    { title: "Resúmenes y especiales", kinds: ["SUMMARY"] },
    { title: "Versiones alternativas", kinds: ["ALTERNATIVE"] },
    { title: "Otras conexiones", kinds: ["OTHER"] },
  ].map((group) => ({
    ...group,
    relations: anime.relations.filter((relation) =>
      group.kinds.includes(relation.kind),
    ),
  }));
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
                    className="relative mr-0.5 flex size-2.5"
                    aria-hidden="true"
                  >
                    <i className="absolute inline-flex size-full animate-ping rounded-full bg-[#35D39B]/45" />
                    <i className="relative inline-flex size-2.5 rounded-full bg-[#35D39B] shadow-[0_0_12px_rgba(53,211,155,.72)]" />
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
        <EpisodeBrowser
          slug={anime.slug}
          title={anime.title}
          posterUrl={anime.posterUrl}
          backdropUrl={anime.backdropUrl}
          initial={episodes.data}
          totalRecords={episodes.meta.totalRecords}
        />
        {relationGroups.map((group) =>
          group.relations.length > 0 ? (
            <RelationSection
              key={group.title}
              title={group.title}
              relations={group.relations}
            />
          ) : null,
        )}
      </div>
    </main>
  );
}

function RelationSection({
  title,
  relations,
}: {
  title: string;
  relations: AnimeResponse["data"]["relations"];
}) {
  const labels: Record<string, string> = {
    PREQUEL: "Precuela",
    SEQUEL: "Secuela",
    MAIN_STORY: "Historia principal",
    SIDE_STORY: "Historia paralela",
    SUMMARY: "Resumen",
    ALTERNATIVE: "Versión alternativa",
    OTHER: "Otra conexión",
  };
  return (
    <section>
      <div className="mb-5">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#69A7FF]">
            Conexiones
          </span>
          <h2 className="mt-1 font-(family-name:--font-display) text-3xl font-semibold tracking-tight text-[#F3F8FC]">
            {title}
          </h2>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-x-4 gap-y-3 max-lg:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1">
        {relations.map((relation) => (
          <Link
            href={`/anime/${relation.anime.slug}`}
            key={`${relation.kind}-${relation.anime.slug}`}
            className="flex min-w-0 items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-[#111A2A] focus-visible:outline-2 focus-visible:outline-[#5B9CFF]"
          >
            <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded-md bg-[#0B1621]">
              <AnimeImage src={relation.anime.posterUrl} alt="" sizes="80px" />
            </div>
            <span className="min-w-0">
              <small className="block text-[10px] font-bold uppercase tracking-wide text-[#69A7FF]">
                {labels[relation.kind] ?? relation.kind}
              </small>
              <strong className="mt-1 block truncate text-sm font-semibold text-[#F3F8FC]">
                {relation.anime.title}
              </strong>
              {relation.anime.startDate && (
                <em className="mt-1 block text-xs not-italic text-[#8FA3B4]">
                  {new Date(relation.anime.startDate).getUTCFullYear()}
                </em>
              )}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
