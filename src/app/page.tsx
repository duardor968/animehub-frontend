import { Button } from "@heroui/react";
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
      <main className="mx-auto grid min-h-[70vh] w-full max-w-[1600px] place-items-center px-6 py-20 text-center">
        <div className="max-w-lg">
          <h1 className="font-(family-name:--font-display) text-4xl font-semibold tracking-tight text-[#F3F8FC]">
            {apiUnavailable
              ? "AnimeHub todavía está iniciando"
              : "El contenido no está disponible"}
          </h1>
          <p className="mt-4 text-[#8FA3B4]">
            {apiUnavailable
              ? "Vuelve a cargar en unos segundos."
              : "La última copia no pudo recuperarse."}
          </p>
          <form action="/">
            <Button
              className="mt-6 h-11 rounded-xl bg-[#2F81F7] px-6 font-semibold text-white shadow-none"
              type="submit"
            >
              Reintentar
            </Button>
          </form>
        </div>
      </main>
    );
  }

  const featured = response.data.featured;
  return (
    <main>
      {featured.length > 0 && <FeaturedHero anime={featured} />}
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-16 px-6 py-12 max-sm:gap-12 max-sm:px-4 max-sm:pb-28 max-sm:pt-10">
        <section>
          <div className="mb-5 flex items-end justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#69A7FF]">
                Ahora
              </span>
              <h2 className="mt-1 font-(family-name:--font-display) text-3xl font-semibold tracking-tight text-[#F3F8FC] max-sm:text-2xl">
                Episodios recientes
              </h2>
            </div>
          </div>
          <RecentEpisodes episodes={response.data.recentEpisodes} />
        </section>
        <section>
          <div className="mb-5 flex items-end justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#69A7FF]">
                Descubrir
              </span>
              <h2 className="mt-1 font-(family-name:--font-display) text-3xl font-semibold tracking-tight text-[#F3F8FC] max-sm:text-2xl">
                Nuevos en el catálogo
              </h2>
            </div>
          </div>
          <PosterGrid
            anime={response.data.recentAnime}
            variant="home"
            emptyState={{
              title: "Aún no hay novedades",
              description:
                "No encontramos anime reciente para mostrar. Puedes seguir explorando el catálogo.",
              action: {
                href: "/catalogo",
                label: "Explorar el catálogo",
              },
            }}
          />
        </section>
      </div>
    </main>
  );
}
