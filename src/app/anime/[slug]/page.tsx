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
      <section className="anime-hero">
        <div className="anime-backdrop" aria-hidden="true">
          <AnimeImage
            src={anime.backdropUrl}
            fallbackSrc={anime.posterUrl}
            alt=""
            priority
            sizes="100vw"
          />
        </div>
        <div className="anime-vignette" aria-hidden="true" />
        <div className="anime-hero-inner enter">
          <div className="anime-poster">
            <AnimeImage
              src={anime.posterUrl}
              alt={`Póster de ${anime.title}`}
              priority
              sizes="240px"
            />
          </div>
          <div className="anime-copy">
            <div className="anime-kickers">
              <span className="status-pill">
                <i aria-hidden="true" /> {formatStatus(anime.status)}
              </span>
              {anime.mature && (
                <span className="mature-pill">
                  <ShieldAlert size={13} /> Contenido sensible
                </span>
              )}
            </div>
            <h1>{anime.title}</h1>
            {anime.alternativeTitle && (
              <p className="alternative-title">{anime.alternativeTitle}</p>
            )}
            <div className="anime-facts">
              {anime.score !== null && anime.score !== undefined && (
                <span>
                  <Star size={14} fill="currentColor" />{" "}
                  {anime.score.toFixed(2)}
                  {anime.votes ? (
                    <small>{anime.votes.toLocaleString("es")} votos</small>
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
            </div>
            {anime.genres.length > 0 && (
              <div className="genre-list" aria-label="Géneros">
                {anime.genres.map((genre) => (
                  <Link href={`/catalogo?genre=${genre.slug}`} key={genre.id}>
                    {genre.name}
                  </Link>
                ))}
              </div>
            )}
            <p className="synopsis">{anime.synopsis}</p>
            <div className="hero-actions">
              {anime.trailerUrl && (
                <a
                  className="primary-button"
                  href={anime.trailerUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver tráiler <ExternalLink size={14} />
                </a>
              )}
              <a
                className="secondary-button"
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
      <div className="page-shell anime-content">
        <EpisodeBrowser
          slug={anime.slug}
          title={anime.title}
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
    <section className="relations-section">
      <div className="section-header">
        <div>
          <span className="eyebrow">Conexiones</span>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="relation-strip">
        {relations.map((relation) => (
          <Link
            href={`/anime/${relation.anime.slug}`}
            key={`${relation.kind}-${relation.anime.slug}`}
          >
            <div className="relation-poster">
              <AnimeImage src={relation.anime.posterUrl} alt="" sizes="80px" />
            </div>
            <span>
              <small>{labels[relation.kind] ?? relation.kind}</small>
              <strong>{relation.anime.title}</strong>
              {relation.anime.startDate && (
                <em>{new Date(relation.anime.startDate).getUTCFullYear()}</em>
              )}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
