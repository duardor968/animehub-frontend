import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import {
  catalogApiYearBounds,
  catalogHref,
  catalogLanding,
  clearCatalogFilters,
  countCatalogFilters,
  getSelectedFilters,
  isCatalogCapped,
  normalizeCatalogParams,
} from "@/components/catalog/catalog-filter-params";
import {
  outOfRangeParams,
  resolveCatalog,
  sameSearchParams,
  toSearchParams,
  type PageSearchParams,
} from "@/components/catalog/catalog-query";
import { PageHeader, pageMainClass } from "@/components/page-header";
import { Pagination } from "@/components/catalog/pagination";
import { PosterGrid } from "@/components/poster-grid";
import { MAIN_CONTENT_ID } from "@/lib/navigation";
import { siteName, siteOpenGraph } from "@/lib/site";

export const dynamic = "force-dynamic";

const description =
  "Explora el catálogo por formato, estado, año, género o inicial.";

/** /catalogo?q=… is a search: send it (with its filters) to /buscar. */
function searchRedirectTarget(incoming: URLSearchParams) {
  if (!incoming.get("q")?.trim()) return null;
  return catalogHref(
    "/buscar",
    normalizeCatalogParams(incoming, catalogApiYearBounds),
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}): Promise<Metadata> {
  const incoming = toSearchParams(await searchParams);
  if (searchRedirectTarget(incoming)) return { title: "Catálogo" };
  const { params, response, bounds, page } = await resolveCatalog(
    incoming,
    "catalog",
  );
  const filters = getSelectedFilters(
    params,
    response.meta.categories,
    response.meta.genres,
    bounds,
  );
  const labels = filters.map((filter) => filter.label);
  // Filter and sort combinations are endless: besides the plain catalog, only
  // the single-genre and single-format pages are indexable. Every page is its
  // own canonical URL, noindex ones too.
  const landing = catalogLanding(params, filters);
  const indexable =
    landing !== null || (labels.length === 0 && !params.has("order"));
  const canonical = catalogHref("/catalogo", params);
  const title = `${landing?.title ?? (labels.length ? `Catálogo: ${labels.join(", ")}` : "Catálogo")}${page > 1 ? ` (página ${page})` : ""}`;
  const pageDescription = landing?.description ?? description;
  return {
    title,
    description: pageDescription,
    alternates: { canonical },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: {
      ...siteOpenGraph,
      title: `${landing?.title ?? "Catálogo de anime"} · ${siteName}`,
      description: pageDescription,
      url: canonical,
    },
  };
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const incoming = toSearchParams(await searchParams);
  const searchTarget = searchRedirectTarget(incoming);
  if (searchTarget) redirect(searchTarget);

  const { params, response, bounds } = await resolveCatalog(
    incoming,
    "catalog",
  );
  // Past the last page (the source stops at 50): go to the last real page.
  const lastPageParams = outOfRangeParams(params, response.meta.totalPages);
  if (lastPageParams) redirect(catalogHref("/catalogo", lastPageParams));
  // Legacy or hand-edited URLs (several genres, reversed years, unknown
  // values…) settle on their canonical form before anything renders.
  if (!sameSearchParams(incoming, params))
    redirect(catalogHref("/catalogo", params));

  return (
    <main id={MAIN_CONTENT_ID} tabIndex={-1} className={pageMainClass}>
      <PageHeader title="Catálogo" />
      <CatalogFilters
        scope="catalog"
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
        <h2 className="sr-only">Obras</h2>
        <PosterGrid
          anime={response.data}
          emptyState={
            countCatalogFilters(params) > 0
              ? {
                  title: "Ninguna obra coincide con los filtros",
                  action: {
                    href: catalogHref(
                      "/catalogo",
                      clearCatalogFilters(params, bounds),
                    ),
                    label: "Limpiar filtros",
                  },
                }
              : { title: "No hay obras para mostrar" }
          }
        />
      </CatalogFilters>
    </main>
  );
}
