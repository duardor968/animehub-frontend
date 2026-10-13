import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import {
  catalogApiYearBounds,
  catalogHref,
  clearCatalogFilters,
  countCatalogFilters,
  isCatalogCapped,
  normalizeCatalogParams,
  toCatalogApiParams,
} from "@/components/catalog/catalog-filter-params";
import {
  loadCatalog,
  outOfRangeParams,
  resolveCatalog,
  sameSearchParams,
  toSearchParams,
  type PageSearchParams,
} from "@/components/catalog/catalog-query";
import { PageHeader, pageMainClass } from "@/components/page-header";
import { Pagination } from "@/components/catalog/pagination";
import { PosterGrid } from "@/components/poster-grid";
import { SearchBox } from "@/components/search-box";
import { SectionHeading } from "@/components/section-heading";
import { MAIN_CONTENT_ID } from "@/lib/navigation";
import { siteName, siteOpenGraph } from "@/lib/site";

export const dynamic = "force-dynamic";

const description = "Busca anime por título en el catálogo de AnimeHub.";

const readQuery = (incoming: URLSearchParams) =>
  normalizeCatalogParams(incoming, catalogApiYearBounds).get("q") ?? "";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}): Promise<Metadata> {
  const q = readQuery(toSearchParams(await searchParams));
  const title = q ? `Resultados para «${q}»` : "Buscar";
  return {
    title,
    description,
    // Every result set points at the search page itself, never at the home.
    alternates: { canonical: "/buscar" },
    robots: q ? { index: false, follow: true } : undefined,
    openGraph: {
      ...siteOpenGraph,
      title: `${title} · ${siteName}`,
      description,
      url: "/buscar",
    },
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const incoming = toSearchParams(await searchParams);
  const q = readQuery(incoming);

  return (
    <main id={MAIN_CONTENT_ID} tabIndex={-1} className={pageMainClass}>
      <PageHeader title="Buscar" />
      <SearchBox initialQuery={q} />
      {q ? <SearchResults incoming={incoming} /> : <Popular />}
    </main>
  );
}

/** Without a query the page shows what most people look for. */
async function Popular() {
  const response = await loadCatalog(
    toCatalogApiParams(
      new URLSearchParams("order=popular"),
      "catalog",
    ).toString(),
  ).catch(() => null);
  if (!response?.data.length) return null;
  return (
    <section aria-labelledby="buscar-populares" className="mt-12">
      <SectionHeading
        id="buscar-populares"
        title="Más populares"
        more={{ href: "/catalogo?order=popular", label: "Ver catálogo" }}
      />
      <PosterGrid anime={response.data} />
    </section>
  );
}

async function SearchResults({ incoming }: { incoming: URLSearchParams }) {
  const { params, response, bounds } = await resolveCatalog(incoming, "search");
  const lastPageParams = outOfRangeParams(params, response.meta.totalPages);
  if (lastPageParams) redirect(catalogHref("/buscar", lastPageParams));
  if (!sameSearchParams(incoming, params))
    redirect(catalogHref("/buscar", params));

  return (
    <div className="mt-8">
      <CatalogFilters
        scope="search"
        categories={response.meta.categories}
        genres={response.meta.genres}
        years={response.meta.years}
        totalRecords={response.meta.totalRecords}
        capped={isCatalogCapped(response.meta)}
        footer={
          <Pagination
            page={response.meta.page}
            totalPages={response.meta.totalPages}
            query={params.toString()}
          />
        }
      >
        <h2 className="sr-only">Resultados</h2>
        <PosterGrid
          anime={response.data}
          emptyState={
            countCatalogFilters(params) > 0
              ? {
                  title: "Ninguna obra coincide con la búsqueda y los filtros",
                  action: {
                    href: catalogHref(
                      "/buscar",
                      clearCatalogFilters(params, bounds),
                    ),
                    label: "Limpiar filtros",
                  },
                }
              : {
                  title: "Ninguna obra coincide con la búsqueda",
                  action: { href: "/catalogo", label: "Ver catálogo" },
                }
          }
        />
      </CatalogFilters>
    </div>
  );
}
