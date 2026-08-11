import type { Metadata } from "next";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
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
  if (!params.has("page")) params.set("page", "1");
  const response = await apiFetch<CatalogResponse>(`/catalog?${params}`);
  return (
    <main className="page-shell">
      <div className="section-header enter">
        <div>
          <span className="eyebrow">Directorio</span>
          <h1>Catálogo</h1>
          <p>{response.meta.totalRecords} obras disponibles desde AnimeAV1.</p>
        </div>
      </div>
      <CatalogFilters
        categories={response.meta.categories}
        genres={response.meta.genres}
        years={response.meta.years}
      />
      <PosterGrid anime={response.data} />
      <Pagination
        page={response.meta.page}
        totalPages={response.meta.totalPages}
        params={params}
      />
    </main>
  );
}
