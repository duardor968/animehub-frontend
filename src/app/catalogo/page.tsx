import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import {
  catalogApiYearBounds,
  catalogHref,
  clearCatalogFilters,
  countCatalogFilters,
  getSelectedFilters,
  getYearBounds,
  isCatalogCapped,
  normalizeCatalogParams,
  toCatalogApiParams,
} from "@/components/catalog/catalog-filter-params";
import {
  loadCatalog,
  outOfRangeParams,
  sameSearchParams,
  toSearchParams,
  type PageSearchParams,
} from "@/components/catalog/catalog-query";
import { PageHeader, pageMainClass } from "@/components/catalog/page-header";
import { Pagination } from "@/components/catalog/pagination";
import { PosterGrid } from "@/components/poster-grid";

export const dynamic = "force-dynamic";

const description =
  "Explora el catálogo por formato, estado, año, género o inicial.";

async function resolveCatalog(incoming: URLSearchParams) {
  const request = normalizeCatalogParams(incoming, catalogApiYearBounds, {
    keepPage: true,
  });
  const page = Number(request.get("page") ?? 1);
  const response = await loadCatalog(
    toCatalogApiParams(request, "catalog", { page }).toString(),
  );
  const bounds = getYearBounds(response.meta.years);
  const params = normalizeCatalogParams(request, bounds, {
    keepPage: true,
    allowedCategories: new Set(
      response.meta.categories.map((category) => category.slug),
    ),
    allowedGenres: new Set(response.meta.genres.map((genre) => genre.slug)),
  });
  return { params, response, bounds, page };
}

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
  const { params, response, bounds, page } = await resolveCatalog(incoming);
  const labels = getSelectedFilters(
    params,
    response.meta.categories,
    response.meta.genres,
    bounds,
  ).map((filter) => filter.label);
  // Filter and sort combinations are endless; only the plain paginated
  // catalog is indexable, each page with its own canonical URL.
  const isFiltered = labels.length > 0 || params.has("order");
  const canonical =
    !isFiltered && page > 1 ? `/catalogo?page=${page}` : "/catalogo";
  const title = `${labels.length ? `Catálogo: ${labels.join(", ")}` : "Catálogo"}${page > 1 ? ` (página ${page})` : ""}`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: isFiltered ? { index: false, follow: true } : undefined,
    openGraph: {
      title: "Catálogo de anime · AnimeHub",
      description,
      url: canonical,
      siteName: "AnimeHub",
      locale: "es_ES",
      type: "website",
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

  const { params, response, bounds } = await resolveCatalog(incoming);
  // Past the last page (the source stops at 50): go to the last real page.
  const lastPageParams = outOfRangeParams(params, response.meta.totalPages);
  if (lastPageParams) redirect(catalogHref("/catalogo", lastPageParams));
  // Legacy or hand-edited URLs (several genres, reversed years, unknown
  // values…) settle on their canonical form before anything renders.
  if (!sameSearchParams(incoming, params))
    redirect(catalogHref("/catalogo", params));

  const hasActiveFilters = countCatalogFilters(params) > 0;
  const clearHref = catalogHref(
    "/catalogo",
    clearCatalogFilters(params, bounds),
  );

  return (
    <main id="contenido" tabIndex={-1} className={pageMainClass}>
      <PageHeader
        eyebrow="Directorio"
        title="Catálogo"
        description={description}
      />
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
            hasActiveFilters
              ? {
                  title: "Ninguna obra coincide",
                  description:
                    "Prueba con una combinación más amplia de formato, estado, año, género o inicial.",
                  action: { href: clearHref, label: "Limpiar filtros" },
                }
              : {
                  title: "No hay obras para mostrar",
                  description:
                    "El catálogo no devolvió resultados. Vuelve a intentarlo en unos minutos.",
                }
          }
        />
      </CatalogFilters>
    </main>
  );
}
