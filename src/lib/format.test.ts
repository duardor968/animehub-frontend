import { describe, expect, it } from "vitest";
import { formatNumber, plural } from "./format";

describe("formatNumber", () => {
  it("groups thousands with Spanish separators, including 4-digit numbers", () => {
    expect(formatNumber(7)).toBe("7");
    expect(formatNumber(1180)).toBe("1.180");
    expect(formatNumber(50000)).toBe("50.000");
  });
});

describe("plural", () => {
  it("uses the singular form only for exactly one", () => {
    expect(plural(1, "episodio", "episodios")).toBe("1 episodio");
    expect(plural(0, "episodio", "episodios")).toBe("0 episodios");
    expect(plural(2, "obra", "obras")).toBe("2 obras");
  });

  it("formats large counts with es grouping", () => {
    expect(plural(1180, "episodio", "episodios")).toBe("1.180 episodios");
  });
});
