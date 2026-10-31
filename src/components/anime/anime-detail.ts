// Shared by the server page and the client episode browser (kept out of the
// "use client" module so the server can call these).

/** Episodes per page of GET /anime/{slug}/episodes. */
export const EPISODE_PAGE_SIZE = 50;
/** Highest `page` GET /anime/{slug}/episodes accepts (400 above it). */
export const MAX_EPISODE_PAGE = 1000;

/** "asc": first episodes first (the API's order); "desc": newest first. */
export type EpisodeOrder = "asc" | "desc";
const orderParam: Record<EpisodeOrder, string> = {
  asc: "primeros",
  desc: "recientes",
};

/** A series still running: airing, or paused between seasons. */
export const isRunning = (status: string) =>
  status === "AIRING" || status === "PAUSED";

/** Newest first is the default of a running series with more than one page;
 *  the rest start at episode one. */
export const defaultEpisodeOrder = (
  status: string,
  totalPages: number,
): EpisodeOrder => (isRunning(status) && totalPages > 1 ? "desc" : "asc");

/** Reads ?orden=, falling back to the work's default. */
export function parseEpisodeOrder(
  value: string | null | undefined,
  fallback: EpisodeOrder,
): EpisodeOrder {
  if (value === orderParam.asc) return "asc";
  if (value === orderParam.desc) return "desc";
  return fallback;
}

/** Canonical path for a validated episode page, without navigation fragments.
 *  The order is written only when it isn't the work's default. */
export function animePagePath(
  slug: string,
  page: number,
  order?: { value: EpisodeOrder; default: EpisodeOrder },
) {
  const query = new URLSearchParams();
  if (order && order.value !== order.default)
    query.set("orden", orderParam[order.value]);
  if (page > 1) query.set("page", String(page));
  return `/anime/${slug}${query.size ? `?${query}` : ""}`;
}

/** Page `page` of the newest-first order as a slice of the API's (ascending)
 *  pages: which pages hold it, and where it starts and ends in them. */
export function newestFirstSlice(page: number, totalRecords: number) {
  const end = Math.max(0, totalRecords - (page - 1) * EPISODE_PAGE_SIZE);
  const start = Math.max(0, end - EPISODE_PAGE_SIZE);
  const first = Math.floor(start / EPISODE_PAGE_SIZE) + 1;
  const last = Math.max(first, Math.ceil(end / EPISODE_PAGE_SIZE));
  const pages = Array.from(
    { length: last - first + 1 },
    (_, index) => first + index,
  );
  const offset = start - (first - 1) * EPISODE_PAGE_SIZE;
  return { pages, offset, count: end - start };
}

/** One page of episodes in `order`, from the API's ascending pages. */
export async function loadEpisodes<T>(
  page: number,
  order: EpisodeOrder,
  totalRecords: number,
  fetchPage: (page: number) => Promise<T[]>,
): Promise<T[]> {
  if (order === "asc") return fetchPage(page);
  const { pages, offset, count } = newestFirstSlice(page, totalRecords);
  const lists = await Promise.all(pages.map(fetchPage));
  return lists
    .flat()
    .slice(offset, offset + count)
    .reverse();
}

/** Id of an episode's card: the target of links to that episode. */
export const episodeAnchor = (number: number) =>
  `episodio-${String(number).replace(".", "-")}`;

/** Reads ?page=, falling back to 1 and clamping to the available pages. */
export function parseEpisodePage(
  value: string | null | undefined,
  totalPages: number,
) {
  const page = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(page, Math.max(1, totalPages));
}

/** Meta description: whitespace collapsed, cut at a word boundary. */
export function summarize(text: string, limit = 160) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit - 1);
  const boundary = cut.lastIndexOf(" ");
  return `${(boundary > limit * 0.6 ? cut.slice(0, boundary) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

/** Hide the alternative title when it only repeats the title. */
export function isSameTitle(left: string, right: string) {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, "")
      .toLowerCase();
  return normalize(left) === normalize(right);
}
