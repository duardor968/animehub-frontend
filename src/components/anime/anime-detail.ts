// Shared by the server page and the client episode browser (kept out of the
// "use client" module so the server can call these).

/** Episodes per page of GET /anime/{slug}/episodes. */
export const EPISODE_PAGE_SIZE = 50;
/** Highest `page` GET /anime/{slug}/episodes accepts (400 above it). */
export const MAX_EPISODE_PAGE = 1000;

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
