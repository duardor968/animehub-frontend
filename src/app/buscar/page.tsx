import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import {
  catalogApiYearBounds,
  catalogHref,
  clearCatalogFilters,
  countCatalogFilters,
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
import { SearchBox } from "@/components/search-box";
import { MAIN_CONTENT_ID } from "@/lib/navigation";
import { siteName, siteOpenGraph } from "@/lib/site";

export const dynamic = "force-dynamic";

const description = "Busca por título original o alternativo.";
const minQueryLength = 2;

function readQuery(incoming: URLSearchParams) {
  const request = normalizeCatalogParams(incoming, catalogApiYearBounds, {
    keepPage: true,
  });
  return { request, q: request.get("q") ?? "" };
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}): Promise<Metadata> {
  const { q } = readQuery(toSearchParams(await searchParams));
  const title = q ? `Resultados para «${q}»` : "Buscar";
  return {
    title,
    description:
      "Busca anime por título original o alternativo en el catálogo de AnimeHub.",
    // Every result set points at the search page itself, never at the home.
    alternates: { canonical: "/buscar" },
    robots: q ? { index: false, follow: true } : undefined,
    openGraph: {
      ...siteOpenGraph,
      title: `${title} · ${siteName}`,
      description: "Busca anime por título original o alternativo.",
      url: "/buscar",
    },
  };
}

const shortcuts = [
  { href: "/catalogo", label: "Explorar el catálogo" },
  { href: "/catalogo?order=popular", label: "Más populares" },
  { href: "/catalogo?order=score", label: "Mejor puntuación" },
  { href: "/horario", label: "Horario de la semana" },
] as const;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const incoming = toSearchParams(await searchParams);
  const { request, q } = readQuery(incoming);

  return (
    <main id={MAIN_CONTENT_ID} tabIndex={-1} className={pageMainClass}>
      <PageHeader
        eyebrow="Encontrar"
        title="Buscar"
        description={description}
      />
      <SearchBox initialQuery={q} />
      {q.length >= minQueryLength ? (
        <SearchResults incoming={incoming} request={request} q={q} />
      ) : (
        <SearchHint q={q} />
      )}
    </main>
  );
}

function SearchHint({ q }: { q: string }) {
  return (
    <section aria-labelledby="buscar-sugerencias" className="mt-8">
      {q ? (
        <p role="status" className="text-sm text-subtle">
          Escribe al menos {minQueryLength} caracteres para buscar.
        </p>
      ) : null}
      <h2
        id="buscar-sugerencias"
        className="mt-8 text-sm font-semibold text-foreground"
      >
        ¿No sabes qué buscar?
      </h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {shortcuts.map((shortcut) => (
          <li key={shortcut.href}>
            <Link
              href={shortcut.href}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/8 bg-surface px-4 text-sm font-semibold text-subtle outline-none transition-colors hover:border-link/45 hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {shortcut.label}
              <ArrowRight size={15} aria-hidden="true" className="text-link" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function SearchResults({
  incoming,
  request,
  q,
}: {
  incoming: URLSearchParams;
  request: URLSearchParams;
  q: string;
}) {
  const page = Number(request.get("page") ?? 1);
  const response = await loadCatalog(
    toCatalogApiParams(request, "search", { page }).toString(),
  );
  const bounds = getYearBounds(response.meta.years);
  const params = normalizeCatalogParams(request, bounds, {
    keepPage: true,
    allowedCategories: new Set(
      response.meta.categories.map((category) => category.slug),
    ),
    allowedGenres: new Set(response.meta.genres.map((genre) => genre.slug)),
  });
  const lastPageParams = outOfRangeParams(params, response.meta.totalPages);
  if (lastPageParams) redirect(catalogHref("/buscar", lastPageParams));
  if (!sameSearchParams(incoming, params))
    redirect(catalogHref("/buscar", params));

  const hasActiveFilters = countCatalogFilters(params) > 0;
  const clearHref = catalogHref("/buscar", clearCatalogFilters(params, bounds));

  return (
    <section aria-labelledby="buscar-resultados" className="mt-10">
      <h2
        id="buscar-resultados"
        className="mb-4 break-words font-display text-xl font-semibold text-foreground"
      >
        Resultados para «{q}»
      </h2>
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
        <PosterGrid
          anime={response.data}
          emptyState={{
            title: `Sin coincidencias para «${q}»`,
            description: hasActiveFilters
              ? "Prueba quitando alguno de los filtros aplicados."
              : "Revisa la ortografía, prueba con el título original o alternativo, o explora el catálogo.",
            action: hasActiveFilters
              ? { href: clearHref, label: "Quitar filtros" }
              : { href: "/catalogo", label: "Explorar el catálogo" },
          }}
        />
      </CatalogFilters>
    </section>
  );
}
