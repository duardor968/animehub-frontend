import { describe, expect, it } from "vitest";
import type { components } from "@/lib/api/generated";
import { deriveScheduleEntry } from "./schedule-status";

type Entry = components["schemas"]["ScheduleEntryDto"];
const date = (day: number, hour = 14, minute = 0) =>
  new Date(2026, 8, day, hour, minute);
const entry = (
  published = date(21),
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

describe("schedule episode and local-day lifecycle", () => {
  it("shows the next episode on today's slot before publication", () => {
    expect(deriveScheduleEntry(entry(), date(28, 13))).toEqual({
      number: 12,
      status: "upcoming",
    });
  });
  it("never marks the episode aired merely because the estimated hour passed", () => {
    expect(deriveScheduleEntry(entry(), date(28, 15))).toEqual({
      number: 12,
      status: "delayed",
    });
  });
  it("switches number and status together when publication arrives", () => {
    expect(
      deriveScheduleEntry(
        entry(date(28), { latestEpisode: { id: "12", number: 12 } }),
        date(28, 15),
      ),
    ).toEqual({ number: 12, status: "aired" });
  });
  it("retains the last observed number on other weekdays", () => {
    expect(deriveScheduleEntry(entry(), date(27))).toEqual({
      number: 11,
      status: "idle",
    });
  });
  it("uses local calendar weeks across the spring DST transition", () => {
    const last = new Date(2026, 2, 1, 14);
    expect(
      deriveScheduleEntry(entry(last), new Date(2026, 2, 8, 14, 30)),
    ).toEqual({ number: 12, status: "delayed" });
  });
  it("does not declare a delay early across the autumn DST transition", () => {
    const last = new Date(2026, 9, 25, 14);
    expect(
      deriveScheduleEntry(entry(last), new Date(2026, 10, 1, 13, 30)),
    ).toEqual({ number: 12, status: "upcoming" });
  });
  it("keeps a published finale on its local date then removes it from every tab", () => {
    const final = entry(date(28, 23, 59), {
      isFinalEpisode: true,
      anime: { ...entry().anime, status: "FINISHED" },
      latestEpisode: { id: "12", number: 12 },
    });
    expect(deriveScheduleEntry(final, date(28, 23, 59))).toEqual({
      number: 12,
      status: "finished",
    });
    expect(deriveScheduleEntry(final, date(29, 0))).toBeNull();
    expect(deriveScheduleEntry(final, date(30))).toBeNull();
  });
  it("does not show a cached penultimate episode of a finished series", () => {
    expect(
      deriveScheduleEntry(
        entry(date(21), { anime: { ...entry().anime, status: "FINISHED" } }),
        date(28),
      ),
    ).toBeNull();
  });
  it("does not declare delays or predictions from an obsolete snapshot", () => {
    expect(deriveScheduleEntry(entry(), date(28, 15), true)).toEqual({
      number: 11,
      status: "idle",
    });
  });
  it("rejects invalid and future publication dates", () => {
    expect(deriveScheduleEntry(entry(date(29)), date(28))).toBeNull();
    expect(
      deriveScheduleEntry(
        entry(date(21), { basisPublishedAt: "invalid" }),
        date(28),
      ),
    ).toBeNull();
  });
  it("does not guess the next regular episode after a fractional special", () => {
    expect(
      deriveScheduleEntry(
        entry(date(21), { latestEpisode: { id: "special", number: 11.5 } }),
        date(28, 13),
      ),
    ).toEqual({ number: 11.5, status: "idle" });
  });
});
