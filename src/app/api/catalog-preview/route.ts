import { NextResponse } from "next/server";
import {
  catalogApiYearBounds,
  isCatalogCapped,
  normalizeCatalogParams,
  toCatalogApiParams,
  type CatalogScope,
} from "@/components/catalog/catalog-filter-params";
import { apiFetch, type CatalogResponse } from "@/lib/api/client";

export const dynamic = "force-dynamic";

const headers = { "cache-control": "private, no-store" };

/**
 * Result count for the filter drawer's "Mostrar N obras" button. It requests
 * exactly what the page will request after applying, so applying hits a warm
 * API snapshot. The upstream request ends when the drawer drops this one.
 */
export async function GET(request: Request) {
  const source = new URL(request.url).searchParams;
  const scope: CatalogScope =
    source.get("scope") === "search" ? "search" : "catalog";
  const params = normalizeCatalogParams(source, catalogApiYearBounds);
  if (scope === "search" && !params.has("q"))
    return NextResponse.json({ totalRecords: 0, capped: false }, { headers });

  try {
    const response = await apiFetch<CatalogResponse>(
      `/catalog?${toCatalogApiParams(params, scope)}`,
      { signal: request.signal },
      false,
      { timeoutMs: 10_000 },
    );
    return NextResponse.json(
      {
        totalRecords: response.meta.totalRecords,
        capped: isCatalogCapped(response.meta),
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "Catalog preview unavailable" },
      { status: 503, headers },
    );
  }
}
