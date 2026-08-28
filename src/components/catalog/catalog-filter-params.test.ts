import { describe, expect, it } from "vitest";
import {
  clearCatalogFilters,
  countCatalogFilters,
  normalizeCatalogParams,
  normalizeForSearch,
  resetCatalogPage,
  setCatalogMulti,
  setCatalogYear,
  setCatalogYearRange,
  toCatalogApiParams,
  toggleCatalogParam,
  validateYearRange,
} from "./catalog-filter-params";

const bounds = { min: 1990, max: 2026 };

describe("catalog filter parameters", () => {
  it("normalizes and deduplicates a shareable URL", () => {
    const source = new URLSearchParams(
      "genre=drama&genre=accion&genre=accion&status=emision&q=%20One%20%20Piece%20&page=9&unknown=x",
    );

    expect(
      normalizeCatalogParams(source, bounds, { keepPage: true }).toString(),
    ).toBe("q=One+Piece&genre=accion&genre=drama&status=emision&page=9");
  });

  it("drops unknown taxonomy values when catalog metadata is available", () => {
    const source = new URLSearchParams(
      "genre=accion&genre=__invalid__&category=tv-anime&category=unknown",
    );

    expect(
      normalizeCatalogParams(source, bounds, {
        allowedCategories: new Set(["tv-anime"]),
        allowedGenres: new Set(["accion"]),
      }).toString(),
    ).toBe("category=tv-anime&genre=accion");
  });

  it("drops unsupported status and order values", () => {
    expect(
      normalizeCatalogParams(
        new URLSearchParams("status=watched&order=javascript&page=2"),
        bounds,
        { keepPage: true },
      ).toString(),
    ).toBe("page=2");
  });

  it("accepts only source-backed sort values and canonicalizes its default", () => {
    for (const order of ["score", "popular", "title", "latest_released"]) {
      expect(
        normalizeCatalogParams(new URLSearchParams({ order }), bounds).get(
          "order",
        ),
      ).toBe(order);
    }

    expect(
      normalizeCatalogParams(
        new URLSearchParams({ order: "latest_added" }),
        bounds,
      ).has("order"),
    ).toBe(false);
  });

  it("bounds page and search before they reach the API", () => {
    expect(
      normalizeCatalogParams(
        new URLSearchParams(`q=${"a".repeat(120)}&page=501&unknown=x`),
        { min: 1900, max: 2200 },
        { keepPage: true },
      ).toString(),
    ).toBe(`q=${"a".repeat(100)}`);
  });

  it("preserves the search and order when filters are cleared", () => {
    const source = new URLSearchParams(
      "q=one&order=title&genre=accion&status=emision&minYear=2020&page=4",
    );

    expect(clearCatalogFilters(source, bounds).toString()).toBe(
      "q=one&order=title",
    );
    expect(
      clearCatalogFilters(source, bounds, { resetOrder: true }).toString(),
    ).toBe("q=one");
  });

  it("resets only the page for an out-of-range result set", () => {
    const source = new URLSearchParams(
      "q=one&order=title&genre=accion&status=emision&page=51",
    );

    expect(resetCatalogPage(source, bounds).toString()).toBe(
      "q=one&genre=accion&status=emision&order=title",
    );
  });

  it("never serializes NaN or an out-of-range year", () => {
    const source = new URLSearchParams("q=one&minYear=2020");

    expect(
      setCatalogYear(source, "minYear", Number.NaN, bounds).toString(),
    ).toBe("q=one");
    expect(setCatalogYear(source, "maxYear", 2500, bounds).toString()).toBe(
      "q=one&minYear=2020",
    );
  });

  it("reports an inverted interval instead of silently changing it", () => {
    expect(
      validateYearRange(new URLSearchParams("minYear=2026&maxYear=1990")),
    ).toBe("El año inicial no puede ser posterior al año final.");
    expect(
      validateYearRange(new URLSearchParams("minYear=1990&maxYear=2026")),
    ).toBeNull();
  });

  it("matches genres without accents and ignores excess whitespace", () => {
    expect(normalizeForSearch("  Acción   ")).toBe("accion");
    expect(normalizeForSearch("CIENCIA   FICCIÓN")).toBe("ciencia ficcion");
  });

  it("batches toggles locally and counts the resulting filters", () => {
    let params = new URLSearchParams("q=one&status=emision");
    params = toggleCatalogParam(params, "genre", "accion", bounds);
    params = toggleCatalogParam(params, "category", "tv-anime", bounds);

    expect(params.toString()).toBe(
      "q=one&category=tv-anime&genre=accion&status=emision",
    );
    expect(countCatalogFilters(params)).toBe(3);
  });

  it("replaces a multi-select atomically without dropping search or order", () => {
    const source = new URLSearchParams(
      "q=one&order=title&genre=accion&genre=drama",
    );

    expect(
      setCatalogMulti(
        source,
        "genre",
        ["aventura", "accion"],
        bounds,
      ).toString(),
    ).toBe("q=one&genre=accion&genre=aventura&order=title");
  });

  it("serializes a year range canonically and omits full-range endpoints", () => {
    const source = new URLSearchParams("q=one&minYear=2000&maxYear=2020");

    expect(
      setCatalogYearRange(source, [bounds.min, bounds.max], bounds).toString(),
    ).toBe("q=one");
    expect(setCatalogYearRange(source, [2001, 2020], bounds).toString()).toBe(
      "q=one&minYear=2001&maxYear=2020",
    );
    expect(setCatalogYearRange(source, [2020, 2001], bounds).toString()).toBe(
      "q=one&minYear=2001&maxYear=2020",
    );
  });

  it("maps the UI search parameter to the catalog API", () => {
    expect(
      toCatalogApiParams(
        new URLSearchParams("q=one&genre=accion&order=title"),
      ).toString(),
    ).toBe("genre=accion&order=title&search=one&page=1");
  });
});
