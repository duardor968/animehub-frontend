import { describe, expect, it, vi } from "vitest";
import {
  formatEpisodeNumber,
  formatRelativeTime,
  formatStatus,
} from "./format";

describe("display formatters", () => {
  it("keeps decimal episode numbers meaningful", () => {
    expect(formatEpisodeNumber(12)).toBe("12");
    expect(formatEpisodeNumber(12.5)).toBe("12.5");
  });

  it("expresses publication age without exposing raw timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T16:00:00.000Z"));
    expect(formatRelativeTime("2026-08-11T15:35:00.000Z")).toBe("hace 25 min");
    vi.useRealTimers();
  });

  it("uses concise Spanish status labels", () => {
    expect(formatStatus("AIRING")).toBe("En emisión");
    expect(formatStatus("FINISHED")).toBe("Finalizado");
    expect(formatStatus("UNKNOWN")).toBe("Estado por confirmar");
  });
});
