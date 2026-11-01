import { describe, expect, it, vi } from "vitest";
import type { CatalogResponse } from "@/lib/api/client";
import {
  outOfRangeParams,
  pastCappedEnd,
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
      outOfRangeParams(new URLSearchParams("genre=accion&page=8"), {
        totalPages: 7,
      })?.toString(),
    ).toBe("genre=accion&page=7");
    expect(
      outOfRangeParams(new URLSearchParams("q=zz&page=3"), {
        totalPages: 0,
      })?.toString(),
    ).toBe("q=zz");
    expect(
      outOfRangeParams(new URLSearchParams("page=50"), { totalPages: 50 }),
    ).toBeNull();
    expect(
      outOfRangeParams(new URLSearchParams(""), { totalPages: 0 }),
    ).toBeNull();
  });

  it("keeps pages past the source's cap, where the list says it ends", () => {
    expect(
      outOfRangeParams(new URLSearchParams("page=51"), {
        totalPages: 50,
        capped: true,
      }),
    ).toBeNull();
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

describe("pastCappedEnd", () => {
  it("is past the end only of a list the source cut short", () => {
    expect(pastCappedEnd({ page: 51, totalPages: 50, capped: true })).toBe(
      true,
    );
    expect(pastCappedEnd({ page: 50, totalPages: 50, capped: true })).toBe(
      false,
    );
  });

  it("leaves an empty result set to its empty state", () => {
    expect(pastCappedEnd({ page: 1, totalPages: 0, capped: false })).toBe(
      false,
    );
  });
});
