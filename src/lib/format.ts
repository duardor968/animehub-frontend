// Spanish formats from Intl: four-digit numbers are not grouped ("1180"),
// larger ones are ("59.112").
const numberFormatter = new Intl.NumberFormat("es");
const episodeFormatter = new Intl.NumberFormat("es", { useGrouping: false });
const relativeFormatter = new Intl.RelativeTimeFormat("es", {
  numeric: "auto",
  style: "short",
});

export function formatNumber(value: number) {
  return numberFormatter.format(value);
}

/** An episode number identifies it, so it is never grouped: "1151", "12,5". */
export function formatEpisodeNumber(value: number) {
  return episodeFormatter.format(value);
}

/**
 * Returns the count followed by the right noun form:
 * plural(1, "episodio", "episodios") → "1 episodio".
 */
export function plural(count: number, singular: string, pluralForm: string) {
  return `${formatNumber(count)} ${count === 1 ? singular : pluralForm}`;
}

const relativeUnits: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** Time since a date: "hace 5 min", "hace 3 h", "ayer", "hace 2 sem.". */
export function formatRelativeTime(value: string, now = Date.now()) {
  const seconds = Math.max(0, (now - new Date(value).getTime()) / 1000);
  for (const [unit, size] of relativeUnits) {
    // Whole units elapsed: 23 h 40 min is "hace 23 h", never "hace 24 h".
    if (seconds >= size)
      return relativeFormatter.format(-Math.floor(seconds / size), unit);
  }
  return relativeFormatter.format(0, "second");
}

export function formatStatus(status: string) {
  if (status === "AIRING") return "En emisión";
  if (status === "FINISHED") return "Finalizado";
  if (status === "UPCOMING") return "Próximamente";
  return "Estado por confirmar";
}
