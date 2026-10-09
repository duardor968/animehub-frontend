import type { components } from "@/lib/api/generated";

type ScheduleEntry = components["schemas"]["ScheduleEntryDto"];

export type ScheduleStatus =
  "aired" | "upcoming" | "due" | "delayed" | "final" | "unknown";

/** Cookie holding the viewer's IANA time zone, so the server can render the
 * week the way the viewer will see it. */
export const TIME_ZONE_COOKIE = "tz";

/** Once the expected hour passes, wait this long before calling it late. */
export const DELAY_GRACE_MINUTES = 3 * 60;

/** Same cut-off as the API: older entries no longer describe a weekly slot. */
export const SCHEDULE_MAX_AGE_MS = 21 * 24 * 60 * 60_000;

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
 * tabs), with the same meaning on every day. The API's latestEpisode N was
 * published at P; P's weekday and wall-clock time define the slot O, and N+1
 * is expected at P + 7 days:
 * - P falls in this week (on or after O's day) → "EP N · Emitido"
 *   ("EP N · Final" when N completes the series);
 * - otherwise, before O → "EP N+1 · Próximo"; from O until O + grace →
 *   "EP N+1 · Ahora"; later → "EP N+1 · Retrasado".
 * A finale from an earlier week has no slot left, and entries older than 21
 * days are dropped (the API omits them too).
 */
export function deriveScheduleEntry(
  entry: ScheduleEntry,
  { now, timeZone, stale = false }: ScheduleClock,
): { number: number; status: ScheduleStatus } | null {
  const published = new Date(entry.basisPublishedAt);
  if (
    !Number.isFinite(published.getTime()) ||
    published > now ||
    now.getTime() - published.getTime() > SCHEDULE_MAX_AGE_MS
  )
    return null;
  const number = entry.latestEpisode.number;
  const slot = zonedMoment(published, timeZone);
  const today = zonedMoment(now, timeZone);
  const weekStart = today.dayNumber - weekPosition(today.weekday);
  const airedThisWeek = slot.dayNumber >= weekStart;

  if (entry.isFinalEpisode)
    return airedThisWeek ? { number, status: "final" } : null;
  // A cached penultimate episode of a finished series is not a weekly slot.
  if (entry.anime.status === "FINISHED") return null;
  if (airedThisWeek) return { number, status: "aired" };
  // Without fresh data or a whole next number, don't predict anything.
  if (stale || !Number.isInteger(number)) return { number, status: "unknown" };

  // Wall-clock minutes keep the thresholds on the hour the card shows, across
  // daylight-saving changes.
  const slotDay = weekStart + weekPosition(slot.weekday);
  const nowMinutes = today.dayNumber * MINUTES_PER_DAY + today.minutes;
  const slotMinutes = slotDay * MINUTES_PER_DAY + slot.minutes;
  const next = number + 1;
  if (nowMinutes < slotMinutes) return { number: next, status: "upcoming" };
  if (nowMinutes <= slotMinutes + DELAY_GRACE_MINUTES)
    return { number: next, status: "due" };
  return { number: next, status: "delayed" };
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
