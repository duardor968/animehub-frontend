import Link from "next/link";
import { FeaturedHero } from "@/components/home/featured-hero";
import { RecentEpisodes } from "@/components/home/recent-episodes";
import { PosterGrid } from "@/components/poster-grid";
import {
  ApiConnectionError,
  apiFetch,
  type HomeResponse,
} from "@/lib/api/client";

export const dynamic = "force-dynamic";

async function loadHome() {
  try {
    return {
      response: await apiFetch<HomeResponse>("/home"),
      apiUnavailable: false,
    };
  } catch (error) {
    return {
      response: null,
      apiUnavailable: error instanceof ApiConnectionError,
    };
  }
}

export default async function HomePage() {
  const { response, apiUnavailable } = await loadHome();
  if (!response) {
    return (
      <main className="page-shell error-state">
        <div>
          <h1>
            {apiUnavailable
              ? "AnimeHub todavía está iniciando"
              : "El contenido no está disponible"}
          </h1>
          <p>
            {apiUnavailable
              ? "Vuelve a cargar en unos segundos."
              : "La última copia no pudo recuperarse."}
          </p>
        </div>
      </main>
    );
  }

  const featured =
    response.data.featured.length > 0
      ? response.data.featured
      : response.data.recentAnime.slice(0, 3);
  return (
    <main>
      {featured.length > 0 && <FeaturedHero anime={featured} />}
      <div className="page-shell home-sections">
        <section className="enter-late">
          <div className="section-header">
            <div>
              <span className="eyebrow">Estrenos</span>
              <h2>Recién publicados</h2>
            </div>
            <Link className="quiet-link" href="/horario">
              Ver horario
            </Link>
          </div>
          <RecentEpisodes episodes={response.data.recentEpisodes} />
        </section>
        <section>
          <div className="section-header">
            <div>
              <span className="eyebrow">Catálogo</span>
              <h2>Nuevas incorporaciones</h2>
            </div>
            <Link className="quiet-link" href="/catalogo">
              Catálogo completo
            </Link>
          </div>
          <PosterGrid anime={response.data.recentAnime} />
        </section>
      </div>
    </main>
  );
}
