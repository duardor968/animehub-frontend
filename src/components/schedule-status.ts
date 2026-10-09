import type { components } from "@/lib/api/generated";

type ScheduleEntry = components["schemas"]["ScheduleEntryDto"];

export type ScheduleStatus =
  "aired" | "upcoming" | "delayed" | "paused" | "finished" | "unknown";

/** Cookie holding the viewer's IANA time zone, so the server can render the
 * week the way the viewer will see it. */
export const TIME_ZONE_COOKIE = "tz";

/** Once the expected hour passes, wait this long before calling it late. */
export const DELAY_GRACE_MINUTES = 3 * 60;

const MINUTES_PER_DAY = 24 * 60;
const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone?: string) {
  const key = timeZone ?? "";
  let formatter = partsFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
    partsFormatters.set(key, formatter);
  }
  return formatter;
}

export type ZonedMoment = {
  /** Days since 1970-01-01 of the calendar date in the zone. */
  dayNumber: number;
  /** 0 = Sunday … 6 = Saturday (Date#getDay order). */
  weekday: number;
  /** Minutes since local midnight. */
  minutes: number;
};

/**
 * Calendar date and wall-clock time of an instant in a time zone (the
 * viewer's own zone when `timeZone` is undefined).
 */
export function zonedMoment(date: Date, timeZone?: string): ZonedMoment {
  const parts: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(date))
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  const dayNumber = Math.round(
    Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000,
  );
  return {
    dayNumber,
    weekday: (((dayNumber + 4) % 7) + 7) % 7,
    minutes: (parts.hour % 24) * 60 + parts.minute,
  };
}

/** Monday-first position (the board's column order): Monday 0 … Sunday 6. */
function weekPosition(weekday: number) {
  return (weekday + 6) % 7;
}

export type ScheduleClock = {
  now: Date;
  /** IANA zone used for days and hours; undefined = the viewer's zone. */
  timeZone?: string;
  /** The API could not refresh: never claim absences (late, on hold). */
  stale?: boolean;
};

/**
 * What a weekly slot shows this calendar week (Monday–Sunday, the order of the
 * tabs), with the same meaning on every day:
 * - the slot's episode was published this week → that episode, "Emitido";
 * - otherwise the next episode (latest + 1) is expected on this week's slot:
 *   "Próximo" until its hour (+ grace) passes, then "Retrasado";
 * - two or more weekly slots missed → "En pausa" (no fresh guess at a date).
 * Finales are kept only on their local publication date.
 */
export function deriveScheduleEntry(
  entry: ScheduleEntry,
  { now, timeZone, stale = false }: ScheduleClock,
): { number: number; status: ScheduleStatus } | null {
  const published = new Date(entry.basisPublishedAt);
  if (!Number.isFinite(published.getTime()) || published > now) return null;
  const number = entry.latestEpisode.number;
  const slot = zonedMoment(published, timeZone);
  const today = zonedMoment(now, timeZone);

  if (entry.isFinalEpisode)
    return slot.dayNumber === today.dayNumber
      ? { number, status: "finished" }
      : null;
  // A cached penultimate episode of a finished series is not a weekly slot.
  if (entry.anime.status === "FINISHED") return null;

  const weekStart = today.dayNumber - weekPosition(today.weekday);
  if (slot.dayNumber >= weekStart) return { number, status: "aired" };
  // Without fresh data or a whole next number, don't predict anything.
  if (stale || !Number.isInteger(number)) return { number, status: "unknown" };

  const slotDay = weekStart + weekPosition(slot.weekday);
  const weeksSince = Math.round((slotDay - slot.dayNumber) / 7);
  // Wall-clock comparison keeps the threshold on the hour the card shows,
  // across daylight-saving changes.
  const passed =
    today.dayNumber * MINUTES_PER_DAY + today.minutes >
    slotDay * MINUTES_PER_DAY + slot.minutes + DELAY_GRACE_MINUTES;
  const missedSlots = weeksSince - 1 + Number(passed);
  const next = number + 1;
  if (missedSlots >= 2) return { number: next, status: "paused" };
  if (passed) return { number: next, status: "delayed" };
  return { number: next, status: "upcoming" };
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();
/** "13:05" in the given zone (the viewer's own when undefined). */
export function formatScheduleTime(date: Date, timeZone?: string) {
  const key = timeZone ?? "";
  let formatter = timeFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("es", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    });
    timeFormatters.set(key, formatter);
  }
  return formatter.format(date);
}
