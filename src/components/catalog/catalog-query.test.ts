import { describe, expect, it, vi } from "vitest";
import type { CatalogResponse } from "@/lib/api/client";
import {
  outOfRangeParams,
  resolveCatalog,
  sameSearchParams,
  toSearchParams,
} from "./catalog-query";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ apiFetch }));

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

  it("keeps the first genre the source offers from a hand-edited URL", async () => {
    apiFetch.mockResolvedValue({
      data: [],
      meta: {
        categories: [],
        genres: [{ id: "1", slug: "accion", name: "Acción" }],
        years: [1990, 2026],
      },
    } as unknown as CatalogResponse);
    const { params } = await resolveCatalog(
      new URLSearchParams("genre=__x__&genre=accion"),
      "catalog",
    );
    expect(params.toString()).toBe("genre=accion");
  });
});
