import { describe, expect, it } from "vitest";
import { deriveScheduleStatus } from "./schedule-status";

// Dates are built in the runner's LOCAL time and passed as ISO strings, so the
// weekday/time-of-day math stays consistent whatever timezone CI runs in.
// 2026-08-17 is a Monday; 2026-08-13 and 2026-08-06 are the two prior Thursdays.
const iso = (y: number, m: number, d: number, h: number, min = 0): string =>
  new Date(y, m, d, h, min).toISOString();

describe("deriveScheduleStatus", () => {
  it("marks a recently observed episode as aired", () => {
    const basis = iso(2026, 7, 16, 15, 0); // Sun 15:00
    const now = new Date(2026, 7, 17, 14, 0); // Mon 14:00, 23 hours later
    expect(deriveScheduleStatus(basis, now)).toBe("aired");
  });

  it("stops claiming aired at the 24-hour boundary", () => {
    const basis = iso(2026, 7, 16, 14, 0);
    const now = new Date(2026, 7, 17, 14, 0);
    expect(deriveScheduleStatus(basis, now)).toBe("idle");
  });

  it("shows only the time while the latest observation is within the week", () => {
    const basis = iso(2026, 7, 13, 9, 0); // four days old
    const now = new Date(2026, 7, 17, 14, 0);
    expect(deriveScheduleStatus(basis, now)).toBe("idle");
  });

  it("does not call an episode delayed at exactly 168 hours", () => {
    const basis = iso(2026, 7, 10, 14, 0);
    const now = new Date(2026, 7, 17, 14, 0);
    expect(deriveScheduleStatus(basis, now)).toBe("idle");
  });

  it("marks an episode delayed only after 168 hours", () => {
    const basis = iso(2026, 7, 10, 13, 59);
    const now = new Date(2026, 7, 17, 14, 0);
    expect(deriveScheduleStatus(basis, now)).toBe("delayed");
  });

  it("keeps malformed or future timestamps neutral", () => {
    const now = new Date(2026, 7, 17, 14, 0);
    expect(deriveScheduleStatus("not-a-date", now)).toBe("idle");
    expect(deriveScheduleStatus(iso(2026, 7, 17, 15, 0), now)).toBe("idle");
  });
});
