/** Public origin used for absolute URLs (metadata, sitemap, robots). */
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

export const siteName = "AnimeHub";

export const siteDescription =
  "Catálogo de anime y envíos directos a JDownloader.";

/**
 * Open Graph fields every page shares. Next merges `openGraph` shallowly, so a
 * page that sets its own object must spread these to keep them.
 */
export const siteOpenGraph = {
  siteName,
  locale: "es_ES",
  type: "website",
} as const;
