// The source /horario exposes no explicit air status — only each show's latest
// episode and its createdAt timestamp (normalized as basisPublishedAt). AnimeAV1
// derives its "Emitido / Retrasado" labels from the age of that observation, and
// so do we. This module is kept pure and unit-tested because inferring the status
// from the scheduled clock alone can claim an episode aired before we observed it.

export type ScheduleStatus = "aired" | "delayed" | "idle";

const HOUR_MS = 60 * 60_000;
export const SCHEDULE_RECENT_WINDOW_MS = 24 * HOUR_MS;
export const SCHEDULE_DELAY_THRESHOLD_MS = 168 * HOUR_MS;

// Derive a show's schedule status from its latest episode's publish time.
//   aired   — the source observed a new episode less than 24 hours ago.
//   delayed — the latest observed episode is older than a full weekly window.
//   idle    — neither claim is supported; the board shows only the inferred time.
export function deriveScheduleStatus(
  basisPublishedAt: string,
  now: Date,
): ScheduleStatus {
  const basis = new Date(basisPublishedAt);
  const ageMs = now.getTime() - basis.getTime();

  if (!Number.isFinite(ageMs) || ageMs < 0) return "idle";
  if (ageMs < SCHEDULE_RECENT_WINDOW_MS) return "aired";
  if (ageMs > SCHEDULE_DELAY_THRESHOLD_MS) return "delayed";

  return "idle";
}
