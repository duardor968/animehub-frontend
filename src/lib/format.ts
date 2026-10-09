const numberFormatter = new Intl.NumberFormat("es", {
  // Spanish CLDR data skips grouping for 4-digit numbers ("1180"); the UI
  // always groups thousands ("1.180") so counts read the same at any size.
  useGrouping: "always",
});

/** Formats an integer with Spanish thousands separators: 1180 → "1.180". */
export function formatNumber(value: number) {
  return numberFormatter.format(value);
}

/**
 * Returns the count followed by the right noun form:
 * plural(1, "episodio", "episodios") → "1 episodio";
 * plural(1180, "episodio", "episodios") → "1.180 episodios".
 */
export function plural(count: number, singular: string, pluralForm: string) {
  return `${formatNumber(count)} ${count === 1 ? singular : pluralForm}`;
}

export function formatRelativeTime(value?: string | null) {
  if (!value) return "Publicado recientemente";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "Publicado recientemente";
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
  }).format(timestamp);
}

/** Episode numbers read like every other number: 12,5 and 1.084. */
export function formatEpisodeNumber(value: number) {
  return formatNumber(value);
}

export function formatStatus(status: string) {
  if (status === "AIRING") return "En emisión";
  if (status === "FINISHED") return "Finalizado";
  if (status === "UPCOMING") return "Próximamente";
  return "Estado por confirmar";
}
