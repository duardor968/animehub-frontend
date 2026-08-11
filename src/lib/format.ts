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

export function formatEpisodeNumber(value: number) {
  return String(value);
}

export function formatStatus(status: string) {
  if (status === "AIRING") return "En emisión";
  if (status === "FINISHED") return "Finalizado";
  if (status === "UPCOMING") return "Próximamente";
  return "Estado por confirmar";
}
