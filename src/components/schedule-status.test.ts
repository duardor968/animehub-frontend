import { describe, expect, it } from "vitest";
import { deriveScheduleStatus } from "./schedule-status";

// Dates are built in the runner's LOCAL time and passed as ISO strings, so the
// weekday/time-of-day math stays consistent whatever timezone CI runs in.
// 2026-08-17 is a Monday; 2026-08-13 and 2026-08-06 are the two prior Thursdays.
const iso = (y: number, m: number, d: number, h: number, min = 0): string =>
  new Date(y, m, d, h, min).toISOString();

describe("deriveScheduleStatus", () => {
  it("marks a show aired once today's slot time has passed", () => {
    const basis = iso(2026, 7, 17, 13, 0); // today (Mon) 13:00
    const now = new Date(2026, 7, 17, 14, 0); // Mon 14:00
    expect(deriveScheduleStatus(basis, now)).toBe("aired");
  });

  it("marks a show upcoming before today's slot time", () => {
    const basis = iso(2026, 7, 10, 20, 0); // last Mon 20:00 (on schedule)
    const now = new Date(2026, 7, 17, 14, 0); // today (Mon) 14:00, slot is 20:00
    expect(deriveScheduleStatus(basis, now)).toBe("upcoming");
  });

  it("stays idle (no status) on a day that isn't its slot day", () => {
    const basis = iso(2026, 7, 13, 9, 0); // last Thu 09:00 (aired on schedule)
    const now = new Date(2026, 7, 17, 14, 0); // today is Monday
    expect(deriveScheduleStatus(basis, now)).toBe("idle");
  });

  it("marks a show delayed when it missed a past weekly slot", () => {
    const basis = iso(2026, 7, 6, 9, 0); // two Thursdays ago; last Thu had no episode
    const now = new Date(2026, 7, 17, 14, 0); // Monday
    expect(deriveScheduleStatus(basis, now)).toBe("delayed");
  });

  it("marks a show delayed on its own day once past the grace window", () => {
    const basis = iso(2026, 7, 10, 13, 0); // last Mon 13:00; no new episode this Mon
    const now = new Date(2026, 7, 17, 14, 0); // today (Mon) 14:00, an hour past the slot
    expect(deriveScheduleStatus(basis, now)).toBe("delayed");
  });

  it("does not flicker to delayed within the grace window (snapshot may lag)", () => {
    const basis = iso(2026, 7, 10, 13, 0); // last Mon 13:00
    const now = new Date(2026, 7, 17, 13, 10); // today 13:10, only 10 min past the slot
    expect(deriveScheduleStatus(basis, now)).toBe("aired");
  });
});
