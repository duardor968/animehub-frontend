// The source /horario exposes no weekday, air time or status — only each show's
// latest episode and when it was published (basisPublishedAt). animeav1 derives
// its "Emitido / Retrasado / próximo" labels purely from that timestamp on the
// client, and so do we. This module is that derivation, kept pure and unit-tested
// because it is the piece we kept getting subtly wrong.

export type ScheduleStatus = "aired" | "upcoming" | "delayed" | "idle";

// A show's weekly slot is inferred from its latest episode's publish time. Around
// that slot the real air time jitters a little week to week, and our snapshot can
// lag the actual airing by a scrape cycle — so we wait this long past a missed
// occurrence before calling a show "Retrasado", to avoid flickering the label.
export const SCHEDULE_DELAY_GRACE_MS = 30 * 60_000;

const WEEK_MS = 7 * 24 * 60 * 60_000;

// The most recent moment <= now sharing basis's weekday and time-of-day (the last
// time this show's weekly slot came around).
function mostRecentOccurrence(basis: Date, now: Date): Date {
  const occurrence = new Date(now);
  const daysSinceSlot = (now.getDay() - basis.getDay() + 7) % 7;
  occurrence.setDate(now.getDate() - daysSinceSlot);
  occurrence.setHours(basis.getHours(), basis.getMinutes(), 0, 0);
  // daysSinceSlot === 0 (slot is today) can still land in the future if the slot
  // time hasn't passed yet today — step back a week to the real last occurrence.
  if (occurrence.getTime() > now.getTime())
    occurrence.setTime(occurrence.getTime() - WEEK_MS);
  return occurrence;
}

// Derive a show's schedule status from its latest episode's publish time.
//   delayed  — its slot came around (past a grace window) with no new episode; a
//              persistent "behind schedule" state, shown on any day until it airs.
//   aired    — today is its slot day and this week's episode has already aired.
//   upcoming — today is its slot day and its episode is still to come today.
//   idle     — on schedule but today isn't its day (just show the slot time).
export function deriveScheduleStatus(
  basisPublishedAt: string,
  now: Date,
): ScheduleStatus {
  const basis = new Date(basisPublishedAt);
  const lastOccurrence = mostRecentOccurrence(basis, now);

  // Behind schedule: the last slot that should have produced an episode passed
  // (beyond the grace window) and the latest episode still predates it.
  if (
    now.getTime() - lastOccurrence.getTime() > SCHEDULE_DELAY_GRACE_MS &&
    basis.getTime() < lastOccurrence.getTime()
  ) {
    return "delayed";
  }

  if (basis.getDay() === now.getDay()) {
    const todayOccurrence = new Date(now);
    todayOccurrence.setHours(basis.getHours(), basis.getMinutes(), 0, 0);
    return now.getTime() >= todayOccurrence.getTime() ? "aired" : "upcoming";
  }

  return "idle";
}
