import Link from "next/link";
import { FeaturedHero } from "@/components/home/featured-hero";
import { RecentEpisodes } from "@/components/home/recent-episodes";
import { PosterGrid } from "@/components/poster-grid";
import { apiFetch, type HomeResponse } from "@/lib/api/client";

export const dynamic = "force-dynamic";

async function loadHome() {
  try {
    return await apiFetch<HomeResponse>("/home");
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const response = await loadHome();
  if (!response) {
    return (
      <main className="page-shell error-state">
        <div>
          <h1>La fuente no responde</h1>
          <p>AnimeHub volverá a intentarlo cuando recargues.</p>
        </div>
      </main>
    );
  }

  const featured = response.data.featured[0] ?? response.data.recentAnime[0];
  return (
    <main>
      {featured && <FeaturedHero anime={featured} />}
      <div className="page-shell home-sections">
        <section className="enter-late">
          <div className="section-header">
            <div>
              <span className="eyebrow">Ahora</span>
              <h2>Episodios recientes</h2>
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
              <span className="eyebrow">Descubrir</span>
              <h2>Añadidos al catálogo</h2>
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
