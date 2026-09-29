import type { components } from "@/lib/api/generated";

type ScheduleEntry = components["schemas"]["ScheduleEntryDto"];
export type ScheduleStatus =
  "aired" | "delayed" | "upcoming" | "finished" | "idle";

function sameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Number and status describe the same episode. Calendar arithmetic respects DST;
// publication evidence, not the expected clock, determines aired/finalized.
export function deriveScheduleEntry(
  entry: ScheduleEntry,
  now: Date,
  stale = false,
): { number: number; status: ScheduleStatus } | null {
  const published = new Date(entry.basisPublishedAt);
  if (!Number.isFinite(published.getTime()) || published > now) return null;
  const number = entry.latestEpisode.number;
  const today = sameLocalDay(published, now);
  if (entry.isFinalEpisode)
    return today ? { number, status: "finished" } : null;
  // A cached penultimate episode of a finished series is not a weekly slot.
  if (entry.anime.status === "FINISHED") return null;
  if (today) return { number, status: "aired" };
  if (stale) return { number, status: "idle" };
  const expected = new Date(published);
  expected.setDate(expected.getDate() + 7);
  const delayed = now > expected;
  if (published.getDay() === now.getDay() && Number.isInteger(number)) {
    return { number: number + 1, status: delayed ? "delayed" : "upcoming" };
  }
  return { number, status: delayed ? "delayed" : "idle" };
}
