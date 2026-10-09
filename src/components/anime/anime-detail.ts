import type { Episode } from "@/lib/api/client";

// Shared by the server page and the client episode browser (kept out of the
// "use client" module so the server can call these).

/** Episodes per page of GET /anime/{slug}/episodes. */
export const EPISODE_PAGE_SIZE = 50;

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

/**
 * Lowest and highest episode numbers, for the range picker. Interim: derived
 * from the loaded page assuming consecutive numbering (a movie can be
 * episode 0). The planned API meta.firstNumber/lastNumber replace this.
 */
export function episodeBounds(
  episodes: Episode[],
  page: number,
  totalRecords: number,
) {
  const firstOnPage = episodes[0]?.number ?? 1;
  const first = Math.max(0, firstOnPage - (page - 1) * EPISODE_PAGE_SIZE);
  return { first, last: first + Math.max(0, totalRecords - 1) };
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
