/** Public origin used for absolute URLs (metadata, sitemap, robots). */
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

export const siteName = "AnimeHub";

/** The home page's title in search results and link previews. */
export const siteTitle = "AnimeHub: catálogo de anime y horario de emisión";

export const siteDescription =
  "Más de 4000 anime con sus episodios, el horario semanal de estrenos y envío directo a JDownloader.";

/**
 * Open Graph fields every page shares. Next merges `openGraph` shallowly, so a
 * page that sets its own object must spread these to keep them.
 */
export const siteOpenGraph = {
  siteName,
  locale: "es_ES",
  type: "website" as const,
  images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: siteTitle }],
};
