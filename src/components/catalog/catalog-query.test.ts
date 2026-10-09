import { describe, expect, it } from "vitest";
import {
  outOfRangeParams,
  sameSearchParams,
  toSearchParams,
} from "./catalog-query";

describe("catalog page query helpers", () => {
  it("rebuilds repeated search params from the Next.js record", () => {
    expect(
      toSearchParams({
        genre: ["mecha", "vampiros"],
        status: "emision",
        empty: undefined,
      }).toString(),
    ).toBe("genre=mecha&genre=vampiros&status=emision");
  });

  it("compares params regardless of key order", () => {
    expect(
      sameSearchParams(
        new URLSearchParams("status=emision&genre=accion"),
        new URLSearchParams("genre=accion&status=emision"),
      ),
    ).toBe(true);
    expect(
      sameSearchParams(
        new URLSearchParams("genre=mecha&genre=vampiros"),
        new URLSearchParams("genre=mecha"),
      ),
    ).toBe(false);
  });

  it("sends pages past the end to the last page, or to the first when empty", () => {
    expect(
      outOfRangeParams(
        new URLSearchParams("genre=accion&page=51"),
        50,
      )?.toString(),
    ).toBe("genre=accion&page=50");
    expect(
      outOfRangeParams(new URLSearchParams("q=zz&page=3"), 0)?.toString(),
    ).toBe("q=zz");
    expect(outOfRangeParams(new URLSearchParams("page=50"), 50)).toBeNull();
    expect(outOfRangeParams(new URLSearchParams(""), 0)).toBeNull();
  });
});
