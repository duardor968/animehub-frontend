import { describe, expect, it } from "vitest";
import type { components } from "@/lib/api/generated";
import { deriveScheduleEntry, zonedMoment } from "./schedule-status";

type Entry = components["schemas"]["ScheduleEntryDto"];
// Calendar week used below: Monday 2026-09-28 … Sunday 2026-10-04 (UTC).
const utc = (day: string, time = "14:00") => new Date(`${day}T${time}:00Z`);
const entry = (
  published = utc("2026-09-21"),
  overrides: Partial<Entry> = {},
): Entry => ({
  anime: {
    id: "1",
    slug: "show",
    title: "Show",
    status: "AIRING",
    mature: false,
  },
  latestEpisode: { id: "11", number: 11 },
  basisPublishedAt: published.toISOString(),
  isFinalEpisode: false,
  ...overrides,
});
const at = (now: Date, extra: { stale?: boolean; timeZone?: string } = {}) => ({
  now,
  timeZone: "UTC",
  ...extra,
});

describe("zonedMoment", () => {
  it("reads the calendar day and hour in the requested zone", () => {
    const instant = new Date("2026-09-28T23:30:00Z");
    expect(zonedMoment(instant, "UTC")).toMatchObject({
      weekday: 1,
      minutes: 23 * 60 + 30,
    });
    expect(zonedMoment(instant, "Europe/Madrid")).toMatchObject({
      weekday: 2,
      minutes: 60 + 30,
    });
    expect(zonedMoment(instant, "America/Mexico_City")).toMatchObject({
      weekday: 1,
      minutes: 17 * 60 + 30,
    });
  });
});

describe("weekly slot status, the same on every day of the week", () => {
  it("shows the next episode on today's slot before its hour", () => {
    expect(
      deriveScheduleEntry(entry(), at(utc("2026-09-28", "13:00"))),
    ).toEqual({ number: 12, status: "upcoming" });
  });
  it("shows the slot as happening now until the grace period ends, then late", () => {
    expect(
      deriveScheduleEntry(entry(), at(utc("2026-09-28", "14:00"))),
    ).toEqual({ number: 12, status: "due" });
    expect(
      deriveScheduleEntry(entry(), at(utc("2026-09-28", "16:59"))),
    ).toEqual({ number: 12, status: "due" });
    expect(
      deriveScheduleEntry(entry(), at(utc("2026-09-28", "17:01"))),
    ).toEqual({ number: 12, status: "delayed" });
  });
  it("switches number and status together when publication arrives", () => {
    expect(
      deriveScheduleEntry(
        entry(utc("2026-09-28", "15:30"), {
          latestEpisode: { id: "12", number: 12 },
        }),
        at(utc("2026-09-28", "16:00")),
      ),
    ).toEqual({ number: 12, status: "aired" });
  });
  it("keeps an episode published earlier this week as aired", () => {
    expect(
      deriveScheduleEntry(
        entry(utc("2026-09-28"), { latestEpisode: { id: "12", number: 12 } }),
        at(utc("2026-10-01")),
      ),
    ).toEqual({ number: 12, status: "aired" });
  });
  it("marks an earlier slot of this week without a new episode as late", () => {
    expect(deriveScheduleEntry(entry(), at(utc("2026-10-01")))).toEqual({
      number: 12,
      status: "delayed",
    });
  });
  it("predicts the next episode for slots later this week", () => {
    expect(
      deriveScheduleEntry(
        entry(utc("2026-09-26", "16:00"), {
          latestEpisode: { id: "3", number: 3 },
        }),
        at(utc("2026-09-30")),
      ),
    ).toEqual({ number: 4, status: "upcoming" });
  });
  it("expects the next episode after a skipped week and drops entries past 21 days", () => {
    // Last aired 2026-09-14: last week's slot was missed, this one is pending.
    const twoWeeks = entry(utc("2026-09-14"));
    expect(
      deriveScheduleEntry(twoWeeks, at(utc("2026-09-28", "10:00"))),
    ).toEqual({ number: 12, status: "upcoming" });
    expect(
      deriveScheduleEntry(twoWeeks, at(utc("2026-09-28", "18:00"))),
    ).toEqual({ number: 12, status: "delayed" });
    // Eleven months (or 22 days) without an episode is not a weekly slot.
    expect(
      deriveScheduleEntry(entry(utc("2025-11-11")), at(utc("2026-10-09"))),
    ).toBeNull();
    expect(
      deriveScheduleEntry(entry(utc("2026-09-06")), at(utc("2026-09-28"))),
    ).toBeNull();
  });
  it("compares wall-clock hours across the autumn DST change", () => {
    // Madrid leaves summer time on 2026-10-25: 14:00 local is 12:00Z, then 13:00Z.
    const last = new Date("2026-10-19T12:00:00Z");
    const madrid = { timeZone: "Europe/Madrid" };
    expect(
      deriveScheduleEntry(
        entry(last),
        at(new Date("2026-10-26T15:30:00Z"), madrid),
      ),
    ).toEqual({ number: 12, status: "due" });
    expect(
      deriveScheduleEntry(
        entry(last),
        at(new Date("2026-10-26T16:30:00Z"), madrid),
      ),
    ).toEqual({ number: 12, status: "delayed" });
  });
  it("keeps a finale as the final episode for the rest of its week", () => {
    const final = entry(utc("2026-09-28", "23:59"), {
      isFinalEpisode: true,
      anime: { ...entry().anime, status: "FINISHED" },
      latestEpisode: { id: "12", number: 12 },
    });
    expect(deriveScheduleEntry(final, at(utc("2026-09-28", "23:59")))).toEqual({
      number: 12,
      status: "final",
    });
    expect(deriveScheduleEntry(final, at(utc("2026-09-29", "00:00")))).toEqual({
      number: 12,
      status: "final",
    });
    // No next episode: nothing to show once its week is over.
    expect(
      deriveScheduleEntry(final, at(utc("2026-10-05", "00:00"))),
    ).toBeNull();
  });
  it("does not show a cached penultimate episode of a finished series", () => {
    expect(
      deriveScheduleEntry(
        entry(utc("2026-09-21"), {
          anime: { ...entry().anime, status: "FINISHED" },
        }),
        at(utc("2026-09-28")),
      ),
    ).toBeNull();
  });
  it("does not declare delays or predictions from an obsolete snapshot", () => {
    expect(
      deriveScheduleEntry(
        entry(),
        at(utc("2026-09-28", "18:00"), { stale: true }),
      ),
    ).toEqual({ number: 11, status: "unknown" });
  });
  it("rejects invalid and future publication dates", () => {
    expect(
      deriveScheduleEntry(entry(utc("2026-09-29")), at(utc("2026-09-28"))),
    ).toBeNull();
    expect(
      deriveScheduleEntry(
        entry(utc("2026-09-21"), { basisPublishedAt: "invalid" }),
        at(utc("2026-09-28")),
      ),
    ).toBeNull();
  });
  it("does not guess the next regular episode after a fractional special", () => {
    expect(
      deriveScheduleEntry(
        entry(utc("2026-09-21"), {
          latestEpisode: { id: "special", number: 11.5 },
        }),
        at(utc("2026-09-28", "13:00")),
      ),
    ).toEqual({ number: 11.5, status: "unknown" });
  });
});
