import type { Metadata } from "next";
import { Pagination } from "@/components/catalog/pagination";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const values = await searchParams;
  const q = typeof values.q === "string" ? values.q : "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    (Array.isArray(value) ? value : value ? [value] : []).forEach((entry) =>
      params.append(key, entry),
    );
  if (!params.has("page")) params.set("page", "1");
  const apiParams = new URLSearchParams(params);
  apiParams.delete("q");
  apiParams.set("search", q.trim());
  const response =
    q.trim().length >= 2
      ? await apiFetch<CatalogResponse>(`/catalog?${apiParams}`)
      : null;
  return (
    <main className="mx-auto min-h-[70vh] w-full max-w-[1600px] px-6 py-12 max-sm:px-4 max-sm:pb-28 max-sm:pt-9">
      <div className="mb-8">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#2F81F7]">
            Encontrar
          </span>
          <h1 className="mt-2 font-(family-name:--font-display) text-5xl font-semibold tracking-[-.04em] text-[#F3F8FC] max-sm:text-4xl">
            Buscar
          </h1>
          <p className="mt-3 text-sm text-[#8FA3B4]">
            Por título original o alternativo.
          </p>
        </div>
      </div>
      <SearchBox />
      {response && (
        <section className="mt-10">
          <CatalogFilters
            categories={response.meta.categories}
            genres={response.meta.genres}
            years={response.meta.years}
            totalRecords={response.meta.totalRecords}
            footer={
              <Pagination
                page={response.meta.page}
                totalPages={response.meta.totalPages}
                params={params}
              />
            }
          >
            <PosterGrid anime={response.data} />
          </CatalogFilters>
        </section>
      )}
    </main>
  );
}
