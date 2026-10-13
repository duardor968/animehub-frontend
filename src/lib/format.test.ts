import { describe, expect, it } from "vitest";
import {
  formatEpisodeNumber,
  formatNumber,
  formatRelativeTime,
  plural,
} from "./format";

describe("formatNumber", () => {
  it("follows Spanish grouping: none for four digits, dots from five", () => {
    expect(formatNumber(7)).toBe("7");
    expect(formatNumber(1180)).toBe("1180");
    expect(formatNumber(50000)).toBe("50.000");
  });
});

describe("plural", () => {
  it("uses the singular form only for exactly one", () => {
    expect(plural(1, "episodio", "episodios")).toBe("1 episodio");
    expect(plural(0, "episodio", "episodios")).toBe("0 episodios");
    expect(plural(59112, "episodio", "episodios")).toBe("59.112 episodios");
  });
});

describe("formatEpisodeNumber", () => {
  it("never groups and keeps the decimal comma", () => {
    expect(formatEpisodeNumber(12.5)).toBe("12,5");
    expect(formatEpisodeNumber(1151)).toBe("1151");
    expect(formatEpisodeNumber(0)).toBe("0");
  });
});

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it("picks the largest whole unit", () => {
    expect(formatRelativeTime(ago(20), now)).toBe("ahora");
    expect(formatRelativeTime(ago(5 * 60), now)).toBe("hace 5 min");
    expect(formatRelativeTime(ago(3 * 3600), now)).toBe("hace 3 h");
    expect(formatRelativeTime(ago(59.6 * 60), now)).toBe("hace 59 min");
    expect(formatRelativeTime(ago(23.6 * 3600), now)).toBe("hace 23 h");
    expect(formatRelativeTime(ago(30 * 3600), now)).toBe("ayer");
    expect(formatRelativeTime(ago(15 * 86400), now)).toBe("hace 2 sem.");
  });

  it("treats a future timestamp (clock skew) as now", () => {
    expect(formatRelativeTime(ago(-120), now)).toBe("ahora");
  });
});
