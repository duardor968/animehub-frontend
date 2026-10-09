import { describe, expect, it } from "vitest";
import {
  clearCatalogFilters,
  countCatalogFilters,
  formatCatalogCount,
  getSelectedFilters,
  isCatalogCapped,
  normalizeCatalogParams,
  normalizeForSearch,
  resetCatalogPage,
  setCatalogMulti,
  setCatalogParam,
  setCatalogYear,
  setCatalogYearRange,
  toCatalogApiParams,
  toggleCatalogParam,
} from "./catalog-filter-params";

const bounds = { min: 1990, max: 2026 };

describe("catalog filter parameters", () => {
  it("normalizes a shareable URL and keeps only the first genre", () => {
    const source = new URLSearchParams(
      "genre=drama&genre=accion&genre=accion&status=emision&q=%20One%20%20Piece%20&page=9&unknown=x",
    );

    expect(
      normalizeCatalogParams(source, bounds, { keepPage: true }).toString(),
    ).toBe("q=One+Piece&genre=drama&status=emision&page=9");
  });

  it("keeps the first valid genre of a legacy multi-genre URL", () => {
    expect(
      normalizeCatalogParams(
        new URLSearchParams("genre=__nope__&genre=mecha&genre=vampiros"),
        bounds,
        { allowedGenres: new Set(["mecha", "vampiros"]) },
      ).toString(),
    ).toBe("genre=mecha");
  });

  it("swaps a reversed year interval instead of producing a reversed chip", () => {
    expect(
      normalizeCatalogParams(
        new URLSearchParams("minYear=2020&maxYear=2010"),
        bounds,
      ).toString(),
    ).toBe("minYear=2010&maxYear=2020");
  });

  it("accepts A–Z and # initials only", () => {
    const letter = (value: string) =>
      normalizeCatalogParams(
        new URLSearchParams({ letter: value }),
        bounds,
      ).get("letter");
    expect(letter("B")).toBe("b");
    expect(letter("#")).toBe("#");
    expect(letter("ñ")).toBeNull();
    expect(letter("ab")).toBeNull();
    expect(letter("1")).toBeNull();
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
        new URLSearchParams(`q=${"a".repeat(120)}&page=999&unknown=x`),
        { min: 1900, max: 2200 },
        { keepPage: true },
      ).toString(),
    ).toBe(`q=${"a".repeat(100)}&page=500`);
    for (const page of ["0", "1", "-3", "abc", "2.5"])
      expect(
        normalizeCatalogParams(new URLSearchParams({ page }), bounds, {
          keepPage: true,
        }).has("page"),
      ).toBe(false);
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

  it("matches genres without accents and ignores excess whitespace", () => {
    expect(normalizeForSearch("  Acción   ")).toBe("accion");
    expect(normalizeForSearch("CIENCIA   FICCIÓN")).toBe("ciencia ficcion");
  });

  it("batches toggles locally and counts the resulting filters", () => {
    let params = new URLSearchParams("q=one&status=emision&letter=a");
    params = setCatalogParam(params, "genre", "accion", bounds);
    params = toggleCatalogParam(params, "category", "tv-anime", bounds);

    expect(params.toString()).toBe(
      "q=one&category=tv-anime&genre=accion&status=emision&letter=a",
    );
    expect(countCatalogFilters(params)).toBe(4);
    expect(
      setCatalogParam(params, "genre", "drama", bounds).getAll("genre"),
    ).toEqual(["drama"]);
  });

  it("replaces a multi-select atomically without dropping search or order", () => {
    const source = new URLSearchParams(
      "q=one&order=title&category=ova&genre=drama",
    );

    expect(
      setCatalogMulti(
        source,
        "category",
        ["tv-anime", "pelicula"],
        bounds,
      ).toString(),
    ).toBe("q=one&category=pelicula&category=tv-anime&genre=drama&order=title");
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
        new URLSearchParams("q=one&genre=accion&order=title&page=3"),
        "search",
        { page: 3 },
      ).toString(),
    ).toBe("genre=accion&order=title&search=one&page=3");
  });

  it("keeps the source's relevance for search and asks for the newest additions in the catalog", () => {
    expect(
      toCatalogApiParams(new URLSearchParams("q=one"), "search").toString(),
    ).toBe("search=one&page=1");
    expect(
      toCatalogApiParams(new URLSearchParams("q=one"), "catalog").toString(),
    ).toBe("order=latest_added&page=1");
    expect(
      toCatalogApiParams(
        new URLSearchParams("order=score"),
        "catalog",
      ).toString(),
    ).toBe("order=score&page=1");
  });

  it("labels applied filters for chips and titles", () => {
    const labels = getSelectedFilters(
      new URLSearchParams(
        "category=tv-anime&genre=accion&status=emision&minYear=2015&maxYear=2015&letter=%23",
      ),
      [{ slug: "tv-anime", name: "TV Anime" }],
      [{ slug: "accion", name: "Acción" }],
      bounds,
    ).map((filter) => filter.label);
    expect(labels).toEqual([
      "TV Anime",
      "Acción",
      "En emisión",
      "2015",
      "Inicial: #",
    ]);
  });

  it("reports a capped result set only when the API says so", () => {
    expect(isCatalogCapped({})).toBe(false);
    expect(isCatalogCapped({ capped: false })).toBe(false);
    expect(isCatalogCapped({ capped: true })).toBe(true);
    expect(formatCatalogCount(1000, true)).toBe("Más de 1.000 obras");
    expect(formatCatalogCount(1, false)).toBe("1 obra");
    expect(formatCatalogCount(23, false)).toBe("23 obras");
  });
});
