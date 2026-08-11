import { ExternalLink, Star } from "lucide-react";
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
    { title: "Historias principales", kinds: ["MAIN_STORY"] },
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
      <section className="anime-hero">
        <div className="anime-backdrop">
          <AnimeImage src={anime.backdropUrl} alt="" priority sizes="100vw" />
        </div>
        <div className="anime-vignette" />
        <div className="anime-hero-inner enter">
          <div className="anime-poster">
            <AnimeImage
              src={anime.posterUrl}
              alt={anime.title}
              priority
              sizes="220px"
            />
          </div>
          <div className="anime-copy">
            <div className="anime-kickers">
              {anime.mature && <span>Contenido sensible</span>}
              <span>
                {anime.status === "AIRING"
                  ? "En emisión"
                  : anime.status === "FINISHED"
                    ? "Finalizado"
                    : "Próximamente"}
              </span>
            </div>
            <h1>{anime.title}</h1>
            {anime.alternativeTitle && (
              <p className="alternative-title">{anime.alternativeTitle}</p>
            )}
            <div className="anime-facts">
              {anime.score && (
                <span>
                  <Star size={14} fill="currentColor" />{" "}
                  {anime.score.toFixed(2)}
                </span>
              )}
              {anime.startDate && (
                <span>{new Date(anime.startDate).getUTCFullYear()}</span>
              )}
              {anime.category && <span>{anime.category.name}</span>}
              {anime.episodeCount && (
                <span>{anime.episodeCount} episodios</span>
              )}
            </div>
            <p className="synopsis">{anime.synopsis}</p>
            <div className="hero-actions">
              {anime.trailerUrl && (
                <a
                  className="secondary-button"
                  href={anime.trailerUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Tráiler <ExternalLink size={14} />
                </a>
              )}
              <a
                className="secondary-button"
                href={anime.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                AnimeAV1 <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      </section>
      <div className="page-shell anime-content">
        {relationGroups.map((group) =>
          group.relations.length > 0 ? (
            <RelationSection
              key={group.title}
              title={group.title}
              relations={group.relations}
            />
          ) : null,
        )}
        <EpisodeBrowser
          slug={anime.slug}
          title={anime.title}
          initial={episodes.data}
          totalRecords={episodes.meta.totalRecords}
        />
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
    <section className="relations-section">
      <div className="section-header">
        <h2>{title}</h2>
      </div>
      <div className="relation-strip">
        {relations.map((relation) => (
          <Link
            href={`/anime/${relation.anime.slug}`}
            key={`${relation.kind}-${relation.anime.slug}`}
          >
            <span>{labels[relation.kind] ?? relation.kind}</span>
            <strong>{relation.anime.title}</strong>
            {relation.anime.startDate && (
              <small>
                {new Date(relation.anime.startDate).getUTCFullYear()}
              </small>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
