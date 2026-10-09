import { formatNumber, plural } from "@/lib/format";
import type { AudioPreference, DownloadRequest } from "./download-types";

export interface ResolvedEpisodeLike {
  episodeNumber: number;
  audio: AudioPreference;
  links: Array<{ url: string }>;
  errorCode?: string | null;
}

const byNumber = (left: number, right: number) => left - right;

/** Stable identity for "the same download": used to de-duplicate toasts and
 *  to tell a button that its own request is still running. */
export function requestKey(request: DownloadRequest): string {
  if (request.all) return `${request.slug}|all`;
  if (request.episodeNumbers) {
    const numbers = [...new Set(request.episodeNumbers)].sort(byNumber);
    return `${request.slug}|ep|${numbers.join(",")}`;
  }
  return `${request.slug}|range|${request.from ?? ""}-${request.to ?? ""}`;
}

/** Number of episodes a request covers, when it is known up front. */
export function requestEpisodeCount(request: DownloadRequest): number {
  if (request.all) return request.total ?? 0;
  if (request.episodeNumbers) return new Set(request.episodeNumbers).size;
  if (request.from !== undefined && request.to !== undefined)
    return Math.max(0, request.to - request.from + 1);
  return 0;
}

/** Compresses episode numbers into runs: [1,2,3,5,8,9] → "1–3, 5, 8–9". */
export function formatEpisodeRanges(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort(byNumber);
  const runs: Array<[number, number]> = [];
  for (const number of sorted) {
    const last = runs.at(-1);
    if (last && Number.isInteger(number) && number === last[1] + 1)
      last[1] = number;
    else runs.push([number, number]);
  }
  return runs
    .map(([start, end]) =>
      start === end
        ? formatNumber(start)
        : `${formatNumber(start)}–${formatNumber(end)}`,
    )
    .join(", ");
}

/** Short label for the episodes in a request: "Ep. 5", "Ep. 1–50",
 *  "Ep. 1–3, 7", "12 episodios" or "Todos (1.180 episodios)". */
export function describeEpisodes(request: DownloadRequest): string {
  if (request.all) {
    return request.total
      ? `Todos (${plural(request.total, "episodio", "episodios")})`
      : "Todos los episodios";
  }
  if (request.episodeNumbers?.length) {
    const ranges = formatEpisodeRanges(request.episodeNumbers);
    return ranges.split(", ").length <= 3
      ? `Ep. ${ranges}`
      : plural(new Set(request.episodeNumbers).size, "episodio", "episodios");
  }
  if (request.from !== undefined && request.to !== undefined) {
    return request.from === request.to
      ? `Ep. ${formatNumber(request.from)}`
      : `Ep. ${formatNumber(request.from)}–${formatNumber(request.to)}`;
  }
  return "Episodios";
}

/** "One Piece · Ep. 1–50": names the anime and episodes in every toast. */
export function describeRequest(request: DownloadRequest): string {
  return `${request.title} · ${describeEpisodes(request)}`;
}

export function collectUrls(episodes: ResolvedEpisodeLike[]): string[] {
  return episodes.flatMap((episode) => episode.links.map((link) => link.url));
}

/** Every mirror is sent (JDownloader groups them), so the copy makes clear
 *  that several links can belong to one episode. */
export function describeLinks(episodes: ResolvedEpisodeLike[]): string {
  const withLinks = episodes.filter((episode) => episode.links.length > 0);
  const linkCount = withLinks.reduce(
    (total, episode) => total + episode.links.length,
    0,
  );
  const links = plural(linkCount, "enlace", "enlaces");
  const episodesLabel = plural(withLinks.length, "episodio", "episodios");
  return linkCount > withLinks.length
    ? `${links} (espejos) de ${episodesLabel}`
    : `${links} de ${episodesLabel}`;
}

export function failedEpisodeNumbers(episodes: ResolvedEpisodeLike[]) {
  return episodes
    .filter((episode) => episode.errorCode || episode.links.length === 0)
    .map((episode) => episode.episodeNumber);
}

/** "Sin enlaces: episodios 1–7." with the numbers, or a count when long.
 *  When the source itself failed (SOURCE_UNAVAILABLE) it says so, since a
 *  retry may then work. */
export function describeFailed(
  numbers: number[],
  fallbackCount = 0,
  episodes: ResolvedEpisodeLike[] = [],
): string {
  if (numbers.length === 0) {
    return fallbackCount > 0
      ? `${plural(fallbackCount, "episodio", "episodios")} sin enlaces.`
      : "";
  }
  const failed = new Set(numbers);
  const sourceDown =
    episodes.length > 0 &&
    episodes
      .filter((episode) => failed.has(episode.episodeNumber))
      .every((episode) => episode.errorCode === "SOURCE_UNAVAILABLE");
  const ranges = formatEpisodeRanges(numbers);
  const label =
    ranges.split(", ").length > 4
      ? plural(numbers.length, "episodio", "episodios")
      : numbers.length === 1
        ? `el episodio ${ranges}`
        : `los episodios ${ranges}`;
  if (sourceDown)
    return `AnimeAV1 no respondió para ${label}; puedes reintentarlo.`;
  if (ranges.split(", ").length > 4)
    return `${plural(numbers.length, "episodio", "episodios")} sin enlaces.`;
  return numbers.length === 1
    ? `El episodio ${ranges} no tiene enlaces.`
    : `Sin enlaces: episodios ${ranges}.`;
}

/** Explains episode numbers a job skipped because the anime lacks them. */
export function describeMissing(numbers: number[] | undefined): string {
  if (!numbers?.length) return "";
  const ranges = formatEpisodeRanges(numbers);
  if (ranges.split(", ").length > 4)
    return `Se omitieron ${plural(numbers.length, "episodio que no existe", "episodios que no existen")}.`;
  return numbers.length === 1
    ? `Se omitió el episodio ${ranges}: no existe.`
    : `Se omitieron los episodios ${ranges}: no existen.`;
}

const audioNames: Record<AudioPreference, string> = {
  SUB: "subtitulado (SUB)",
  DUB: "doblado (DUB)",
};

/** Tells the user when the preferred audio wasn't available. */
export function describeAudioFallback(
  episodes: ResolvedEpisodeLike[],
  preferred: AudioPreference,
): string {
  const fallback = episodes.filter(
    (episode) => episode.links.length > 0 && episode.audio !== preferred,
  );
  if (fallback.length === 0) return "";
  const other = fallback[0].audio;
  return `${plural(fallback.length, "episodio", "episodios")} en ${audioNames[other]}: no había ${preferred}.`;
}
