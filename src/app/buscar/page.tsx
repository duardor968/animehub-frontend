import type { Metadata } from "next";
import { Pagination } from "@/components/catalog/pagination";
import { PosterGrid } from "@/components/poster-grid";
import { SearchBox } from "@/components/search-box";
import { apiFetch, type CatalogResponse } from "@/lib/api/client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Buscar",
  robots: { index: false, follow: true },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page = "1" } = await searchParams;
  const response =
    q.trim().length >= 2
      ? await apiFetch<CatalogResponse>(
          `/catalog?search=${encodeURIComponent(q.trim())}&page=${encodeURIComponent(page)}`,
        )
      : null;
  const params = new URLSearchParams({ q, page });
  return (
    <main className="page-shell search-page">
      <div className="section-header enter">
        <div>
          <span className="eyebrow">Encontrar</span>
          <h1>Buscar</h1>
          <p>Por título original o alternativo.</p>
        </div>
      </div>
      <SearchBox />
      {response && (
        <section className="search-results">
          <p className="result-count">
            {response.meta.totalRecords} resultados para “{q}”
          </p>
          <PosterGrid anime={response.data} />
          <Pagination
            page={response.meta.page}
            totalPages={response.meta.totalPages}
            params={params}
          />
        </section>
      )}
    </main>
  );
}
