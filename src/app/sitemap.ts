import type { MetadataRoute } from "next";
import { apiFetch, type CatalogResponse } from "@/lib/api/client";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const staticEntries: MetadataRoute.Sitemap = [
    { url: site, changeFrequency: "hourly", priority: 1 },
    { url: `${site}/catalogo`, changeFrequency: "daily", priority: 0.8 },
    { url: `${site}/horario`, changeFrequency: "daily", priority: 0.8 },
  ];

  try {
    const catalog = await apiFetch<CatalogResponse>("/catalog?page=1");
    return [
      ...staticEntries,
      ...catalog.data.map((anime) => ({
        url: `${site}/anime/${anime.slug}`,
        changeFrequency: "daily" as const,
        priority: 0.7,
      })),
    ];
  } catch {
    return staticEntries;
  }
}
