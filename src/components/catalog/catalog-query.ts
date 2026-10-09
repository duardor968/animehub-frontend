import { cache } from "react";
import { apiFetch, type CatalogResponse } from "@/lib/api/client";

export type PageSearchParams = Record<string, string | string[] | undefined>;

export function toSearchParams(values: PageSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    (Array.isArray(value) ? value : value ? [value] : []).forEach((entry) =>
      params.append(key, entry),
    );
  return params;
}

/**
 * One catalog request per render: generateMetadata and the page share it.
 * Keyed by the API query string.
 */
export const loadCatalog = cache((query: string) =>
  apiFetch<CatalogResponse>(`/catalog?${query}`),
);

/** Same keys and values, ignoring the order of the keys. */
export function sameSearchParams(a: URLSearchParams, b: URLSearchParams) {
  const left = new URLSearchParams(a);
  const right = new URLSearchParams(b);
  left.sort();
  right.sort();
  return left.toString() === right.toString();
}

/**
 * Where a request for a page past the end should go: the last page with
 * results (or the first page when there are none). Null when in range.
 */
export function outOfRangeParams(
  params: URLSearchParams,
  totalPages: number,
): URLSearchParams | null {
  const page = Number(params.get("page") ?? 1);
  const lastPage = Math.max(1, totalPages);
  if (page <= lastPage) return null;
  const next = new URLSearchParams(params);
  if (lastPage > 1) next.set("page", String(lastPage));
  else next.delete("page");
  return next;
}
