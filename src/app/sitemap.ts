import type { MetadataRoute } from "next";
import { apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/api/generated";
import { siteUrl } from "@/lib/site";

type SitemapAnimeResponse = components["schemas"]["SitemapAnimeResponseDto"];

// Built per request: a build without the API (CI, Docker) must not bake a
// sitemap that lists only the static pages.
export const dynamic = "force-dynamic";

/** Protocol limit for a single sitemap file. */
export const MAX_SITEMAP_URLS = 50_000;

const toDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let anime: SitemapAnimeResponse["data"] = [];
  try {
    const response = await apiFetch<SitemapAnimeResponse>(
      "/sitemap/anime",
      {},
      false,
      { timeoutMs: 10_000, retryDelays: [0, 500] },
    );
    anime = Array.isArray(response?.data) ? response.data : [];
  } catch {
    // The API is down: still answer with the static pages (never a 500).
  }

  const latest = anime.reduce<Date | undefined>((newest, item) => {
    const date = toDate(item.updatedAt);
    return date && (!newest || date > newest) ? date : newest;
  }, undefined);

  const staticEntries: MetadataRoute.Sitemap = [
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
  ];

  return [
    ...staticEntries,
    ...anime.slice(0, MAX_SITEMAP_URLS - staticEntries.length).map((item) => ({
      url: `${siteUrl}/anime/${encodeURIComponent(item.slug)}`,
      lastModified: toDate(item.updatedAt),
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ];
}
