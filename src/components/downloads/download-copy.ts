import { formatEpisodeNumber, formatNumber, plural } from "@/lib/format";
import {
  copyOnlyProviders,
  providerLabels,
  type AudioPreference,
  type DownloadDestination,
  type DownloadProviderId,
  type DownloadRequest,
} from "./download-types";

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

/** Number of episodes a request covers, when it is known up front. A range
 *  only knows it when the caller does (`total`): the API also sends the
 *  specials between its bounds (12.5 in 12–13) and skips gaps. */
export function requestEpisodeCount(request: DownloadRequest): number {
  if (request.all) return request.total ?? 0;
  if (request.episodeNumbers) return new Set(request.episodeNumbers).size;
  return request.total ?? 0;
}

/** Consecutive whole numbers grouped into [start, end] runs. */
function episodeRuns(numbers: number[]): Array<[number, number]> {
  const sorted = [...new Set(numbers)].sort(byNumber);
  const runs: Array<[number, number]> = [];
  for (const number of sorted) {
    const last = runs.at(-1);
    if (last && Number.isInteger(number) && number === last[1] + 1)
      last[1] = number;
    else runs.push([number, number]);
  }
  return runs;
}

/** Compresses episode numbers into runs: [1,2,3,5,8,9] → "1–3, 5, 8–9".
 *  With a decimal special the runs are split by "; " ("12; 12,5; 13"), since
 *  the comma is then the decimal separator. */
export function formatEpisodeRanges(numbers: number[]): string {
  const separator = numbers.every(Number.isInteger) ? ", " : "; ";
  return episodeRuns(numbers)
    .map(([start, end]) =>
      start === end
        ? formatEpisodeNumber(start)
        : `${formatEpisodeNumber(start)}–${formatEpisodeNumber(end)}`,
    )
    .join(separator);
}

const runCount = (numbers: number[]) => episodeRuns(numbers).length;

/** Short label for the episodes in a request: "Ep. 5", "Ep. 1–50",
 *  "Ep. 1–3, 7", "12 episodios" or "Todos (1180 episodios)". */
export function describeEpisodes(request: DownloadRequest): string {
  if (request.all) {
    return request.total
      ? `Todos (${plural(request.total, "episodio", "episodios")})`
      : "Todos los episodios";
  }
  if (request.episodeNumbers?.length) {
    return runCount(request.episodeNumbers) <= 3
      ? `Ep. ${formatEpisodeRanges(request.episodeNumbers)}`
      : plural(new Set(request.episodeNumbers).size, "episodio", "episodios");
  }
  if (request.from !== undefined && request.to !== undefined) {
    return request.from === request.to
      ? `Ep. ${formatEpisodeNumber(request.from)}`
      : `Ep. ${formatEpisodeNumber(request.from)}–${formatEpisodeNumber(request.to)}`;
  }
  return "Episodios";
}

// A copy to the clipboard never asks first (see needsConfirmation).
type SentTo = Exclude<DownloadDestination, "COPY">;
const destinationPhrases: Record<SentTo, string> = {
  CNL: "se enviarán a JDownloader",
  MYJD: "se enviarán a MyJDownloader",
  DESKTOP: "se enviarán a AnimeHub Desktop",
};
const listFormat = new Intl.ListFormat("es", { type: "conjunction" });

/** Confirmation of a large download: how many episodes, where they go and
 *  that every mirror of the chosen providers it can take is included. */
export function describeConfirmation(
  request: DownloadRequest,
  destination: SentTo,
  providers: DownloadProviderId[],
) {
  const count = requestEpisodeCount(request);
  const episodes = describeEpisodes(request);
  const heading = request.all
    ? count
      ? `¿Descargar los ${formatNumber(count)} episodios?`
      : "¿Descargar todos los episodios?"
    : count
      ? `¿Descargar ${plural(count, "episodio", "episodios")}?`
      : `¿Descargar los episodios ${episodes.replace("Ep. ", "")}?`;
  const which = count && episodes.startsWith("Ep. ") ? ` (${episodes})` : "";
  const mirrors = listFormat.format(
    Object.entries(providerLabels)
      .filter(
        ([id]) =>
          providers.includes(id as DownloadProviderId) &&
          !copyOnlyProviders.has(id as DownloadProviderId),
      )
      .map(([, label]) => label),
  );
  return {
    heading,
    body:
      destination === "DESKTOP"
        ? `Los episodios de ${request.title}${which} se solicitarán al PC con su perfil de descarga predeterminado.`
        : `Los enlaces de ${request.title}${which} ${destinationPhrases[destination]}, con todos los espejos de ${mirrors}.`,
  };
}

/** "One Piece · Ep. 1–50", or a movie's title alone. */
export function describeRequest(request: DownloadRequest): string {
  return request.movie
    ? request.title
    : `${request.title} · ${describeEpisodes(request)}`;
}

export function collectUrls(episodes: ResolvedEpisodeLike[]): string[] {
  return episodes.flatMap((episode) => episode.links.map((link) => link.url));
}

export const countLinks = (episodes: ResolvedEpisodeLike[]) =>
  episodes.reduce((total, episode) => total + episode.links.length, 0);

/** "4 enlaces", or "1 enlace de Mega" when only that provider's were taken. */
export function describeLinks(
  episodes: ResolvedEpisodeLike[],
  provider?: DownloadProviderId,
): string {
  const links = plural(countLinks(episodes), "enlace", "enlaces");
  return provider ? `${links} de ${providerLabels[provider]}` : links;
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
  const many = runCount(numbers) > 4;
  const label = many
    ? plural(numbers.length, "episodio", "episodios")
    : numbers.length === 1
      ? `el episodio ${ranges}`
      : `los episodios ${ranges}`;
  if (sourceDown)
    return `AnimeAV1 no respondió para ${label}; puedes reintentarlo.`;
  if (many)
    return `${plural(numbers.length, "episodio", "episodios")} sin enlaces.`;
  return numbers.length === 1
    ? `El episodio ${ranges} no tiene enlaces.`
    : `Sin enlaces: episodios ${ranges}.`;
}

/** Explains episode numbers a job skipped because the anime lacks them. */
export function describeMissing(numbers: number[] | undefined): string {
  if (!numbers?.length) return "";
  const ranges = formatEpisodeRanges(numbers);
  if (runCount(numbers) > 4)
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
