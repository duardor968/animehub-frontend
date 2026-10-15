import type { MetadataRoute } from "next";
import {
  catalogFormatLandings,
  catalogHref,
  toCatalogApiParams,
} from "@/components/catalog/catalog-filter-params";
import { apiFetch, type CatalogResponse } from "@/lib/api/client";
import type { components } from "@/lib/api/generated";
import { siteUrl } from "@/lib/site";

type SitemapAnimeResponse = components["schemas"]["SitemapAnimeResponseDto"];

// Built per request: a build without the API (CI, Docker) must not bake a
// sitemap that lists only the static pages. The API lists themselves are
// reused for an hour (Next's data cache, like the API's Cache-Control), so
// crawlers don't trigger a full scan per request; a failed fetch is never cached.
export const dynamic = "force-dynamic";

/** Seconds the API's lists are reused (the anime list's `max-age`). */
export const SITEMAP_REVALIDATE_SECONDS = 3_600;

/** Protocol limit for a single sitemap file. */
export const MAX_SITEMAP_URLS = 50_000;

const fetchOptions = { next: { revalidate: SITEMAP_REVALIDATE_SECONDS } };
const retryOptions = { timeoutMs: 10_000, retryDelays: [0, 500] };

const toDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/** The catalog's indexable filtered pages: one per genre and per known format. */
async function catalogLandings(): Promise<string[]> {
  // The same query as /catalogo's first page, so both share one API snapshot.
  const query = toCatalogApiParams(new URLSearchParams(), "catalog");
  const { meta } = await apiFetch<CatalogResponse>(
    `/catalog?${query}`,
    fetchOptions,
    false,
    retryOptions,
  );
  const landing = (key: "category" | "genre", slug: string) =>
    `${siteUrl}${catalogHref("/catalogo", new URLSearchParams({ [key]: slug }))}`;
  return [
    ...meta.categories
      .filter((category) => catalogFormatLandings.has(category.slug))
      .map((category) => landing("category", category.slug)),
    ...meta.genres.map((genre) => landing("genre", genre.slug)),
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Either list failing still leaves a sitemap (never a 500).
  const [animeList, landings] = await Promise.allSettled([
    apiFetch<SitemapAnimeResponse>(
      "/sitemap/anime",
      fetchOptions,
      false,
      retryOptions,
    ),
    catalogLandings(),
  ]);
  const anime =
    animeList.status === "fulfilled" && Array.isArray(animeList.value?.data)
      ? animeList.value.data
      : [];

  const latest = anime.reduce<Date | undefined>((newest, item) => {
    const date = toDate(item.updatedAt);
    return date && (!newest || date > newest) ? date : newest;
  }, undefined);

  const pageEntries: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: latest,
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: `${siteUrl}/catalogo`,
      lastModified: latest,
      changeFrequency: "daily",
      priority: 0.8,
    },
    { url: `${siteUrl}/horario`, changeFrequency: "daily", priority: 0.8 },
    ...(landings.status === "fulfilled" ? landings.value : []).map((url) => ({
      url,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];

  return [
    ...pageEntries,
    ...anime.slice(0, MAX_SITEMAP_URLS - pageEntries.length).map((item) => ({
      url: `${siteUrl}/anime/${encodeURIComponent(item.slug)}`,
      lastModified: toDate(item.updatedAt),
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ];
}
