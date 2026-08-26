import type { Metadata } from "next";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import {
  catalogApiYearBounds,
  clearCatalogFilters,
  countCatalogFilters,
  getYearBounds,
  normalizeCatalogParams,
  resetCatalogPage,
} from "@/components/catalog/catalog-filter-params";
import { Pagination } from "@/components/catalog/pagination";
import { PosterGrid } from "@/components/poster-grid";
import { apiFetch, type CatalogResponse } from "@/lib/api/client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Catálogo",
  description: "Explora el catálogo completo de AnimeHub.",
  alternates: { canonical: "/catalogo" },
  openGraph: {
    title: "Catálogo de anime · AnimeHub",
    description:
      "Explora obras, géneros, formatos y temporadas desde un único catálogo.",
    url: "/catalogo",
  },
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const values = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    (Array.isArray(value) ? value : value ? [value] : []).forEach((entry) =>
      params.append(key, entry),
    );
  const requestParams = normalizeCatalogParams(params, catalogApiYearBounds, {
    keepPage: true,
  });
  const apiParams = new URLSearchParams(requestParams);
  apiParams.delete("q");
  if (!apiParams.has("page")) apiParams.set("page", "1");
  const response = await apiFetch<CatalogResponse>(`/catalog?${apiParams}`);
  const bounds = getYearBounds(response.meta.years);
  const normalizedParams = normalizeCatalogParams(requestParams, bounds, {
    keepPage: true,
  });
  const hasActiveFilters = countCatalogFilters(normalizedParams) > 0;
  const pageOutOfRange =
    response.meta.totalPages > 0 &&
    response.meta.page > response.meta.totalPages;
  const clearParams = clearCatalogFilters(normalizedParams, bounds);
  const firstPageParams = resetCatalogPage(normalizedParams, bounds);
  const actionParams = pageOutOfRange ? firstPageParams : clearParams;
  const actionHref = `/catalogo${actionParams.size ? `?${actionParams}` : ""}`;
  return (
    <main className="mx-auto w-full max-w-[1600px] px-6 py-12 max-sm:px-4 max-sm:pb-28 max-sm:pt-9">
      <div className="mb-10">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#2F81F7]">
            Directorio
          </span>
          <h1 className="mt-2 font-(family-name:--font-display) text-5xl font-semibold tracking-[-.04em] text-[#F3F8FC] max-sm:text-4xl">
            Catálogo
          </h1>
          <p className="mt-3 text-sm text-[#8FA3B4]">
            {response.meta.totalRecords} obras disponibles.
          </p>
        </div>
      </div>
      <CatalogFilters
        categories={response.meta.categories}
        genres={response.meta.genres}
        years={response.meta.years}
        totalRecords={response.meta.totalRecords}
        footer={
          <Pagination
            page={response.meta.page}
            totalPages={response.meta.totalPages}
            params={normalizedParams}
          />
        }
      >
        <PosterGrid
          anime={response.data}
          emptyState={{
            title: hasActiveFilters
              ? pageOutOfRange
                ? "Esta página no tiene resultados"
                : "Ninguna obra coincide"
              : "Esta página no tiene resultados",
            description: pageOutOfRange
              ? "Vuelve al inicio de estos resultados para seguir explorando."
              : hasActiveFilters
                ? "Prueba con una combinación más amplia de formato, estado, año o género."
                : "Vuelve al inicio del catálogo para seguir explorando las obras disponibles.",
            action: {
              href: actionHref,
              label: pageOutOfRange
                ? "Volver a los resultados"
                : hasActiveFilters
                  ? "Limpiar filtros"
                  : "Volver al catálogo",
            },
          }}
        />
      </CatalogFilters>
    </main>
  );
}
