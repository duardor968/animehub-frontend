import { plural } from "@/lib/format";

const filterKeys = [
  "category",
  "genre",
  "status",
  "minYear",
  "maxYear",
  "letter",
] as const;

const supportedStatus = new Set(["emision", "finalizado", "proximamente"]);
const supportedOrder = new Set([
  "score",
  "popular",
  "title",
  "latest_released",
]);

/** Highest page the catalog API accepts; anything above is clamped to it. */
export const maxCatalogPage = 500;

/** Initials the source can filter by: A–Z plus "#" for digits and symbols. */
export const catalogLetters = [
  ..."abcdefghijklmnopqrstuvwxyz".split(""),
  "#",
] as const;
const supportedLetters = new Set<string>(catalogLetters);

export const catalogApiYearBounds = { min: 1900, max: 2200 } as const;

/**
 * Where the filters run. The catalog defaults to "Últimos agregados"; search
 * keeps the source's own relevance order (exact title first, then newest).
 */
export type CatalogScope = "catalog" | "search";

export type YearBounds = {
  min: number;
  max: number;
};

export function getYearBounds(years: number[]): YearBounds {
  const finiteYears = years.filter(Number.isFinite);
  if (finiteYears.length === 0) {
    return { min: 1900, max: new Date().getFullYear() };
  }
  return {
    min: Math.min(...finiteYears),
    max: Math.max(...finiteYears),
  };
}

export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es");
}

function normalizeText(value: string | null): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  return normalized || null;
}

function normalizeYear(
  value: string | null,
  bounds: YearBounds,
): number | null {
  if (!value || !/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  if (!Number.isSafeInteger(year) || year < bounds.min || year > bounds.max)
    return null;
  return year;
}

function isTaxonomyValue(value: string, allowed?: ReadonlySet<string>) {
  return (
    Boolean(value) && value.length <= 80 && (!allowed || allowed.has(value))
  );
}

function appendUniqueSorted(
  target: URLSearchParams,
  source: URLSearchParams,
  key: "category",
  allowed?: ReadonlySet<string>,
) {
  const values = [...new Set(source.getAll(key).map((value) => value.trim()))]
    .filter((value) => isTaxonomyValue(value, allowed))
    .slice(0, 20)
    .sort((a, b) => a.localeCompare(b, "es"));
  values.forEach((value) => target.append(key, value));
}

/**
 * Canonical, shareable form of the catalog/search query. Genres are
 * single-select (the source ignores the other filters when it receives two or
 * more), so legacy multi-genre URLs keep only their first valid genre.
 */
export function normalizeCatalogParams(
  source: URLSearchParams,
  bounds: YearBounds,
  {
    keepPage = false,
    allowedCategories,
    allowedGenres,
  }: {
    keepPage?: boolean;
    allowedCategories?: ReadonlySet<string>;
    allowedGenres?: ReadonlySet<string>;
  } = {},
): URLSearchParams {
  const normalized = new URLSearchParams();
  const q = normalizeText(source.get("q"))?.slice(0, 100) ?? null;
  const order = normalizeText(source.get("order"));
  const letter = normalizeText(source.get("letter"))?.toLocaleLowerCase("es");
  const status = normalizeText(source.get("status"));
  const genre = source
    .getAll("genre")
    .map((value) => value.trim())
    .find((value) => isTaxonomyValue(value, allowedGenres));
  let minYear = normalizeYear(source.get("minYear"), bounds);
  let maxYear = normalizeYear(source.get("maxYear"), bounds);
  // A hand-edited reversed interval means the same range; never show "2020–2010".
  if (minYear !== null && maxYear !== null && minYear > maxYear)
    [minYear, maxYear] = [maxYear, minYear];

  if (q) normalized.set("q", q);
  appendUniqueSorted(normalized, source, "category", allowedCategories);
  if (genre) normalized.set("genre", genre);
  if (status && supportedStatus.has(status)) normalized.set("status", status);
  if (minYear !== null) normalized.set("minYear", String(minYear));
  if (maxYear !== null) normalized.set("maxYear", String(maxYear));
  if (letter && supportedLetters.has(letter)) normalized.set("letter", letter);
  if (order && supportedOrder.has(order)) normalized.set("order", order);

  if (keepPage) {
    const page = Number(source.get("page"));
    if (Number.isSafeInteger(page) && page > 1)
      normalized.set("page", String(Math.min(page, maxCatalogPage)));
  }

  return normalized;
}

export function resetCatalogPage(
  source: URLSearchParams,
  bounds: YearBounds,
): URLSearchParams {
  return normalizeCatalogParams(source, bounds);
}

export function clearCatalogFilters(
  source: URLSearchParams,
  bounds: YearBounds,
  { resetOrder = false }: { resetOrder?: boolean } = {},
): URLSearchParams {
  const next = normalizeCatalogParams(source, bounds);
  filterKeys.forEach((key) => next.delete(key));
  if (resetOrder) next.delete("order");
  next.delete("page");
  return next;
}

export function toggleCatalogParam(
  source: URLSearchParams,
  key: "category",
  value: string,
  bounds: YearBounds,
): URLSearchParams {
  const next = new URLSearchParams(source);
  const values = next.getAll(key);
  next.delete(key);
  if (values.includes(value)) {
    values
      .filter((entry) => entry !== value)
      .forEach((entry) => next.append(key, entry));
  } else {
    [...values, value].forEach((entry) => next.append(key, entry));
  }
  return normalizeCatalogParams(next, bounds);
}

export function setCatalogMulti(
  source: URLSearchParams,
  key: "category",
  values: readonly string[],
  bounds: YearBounds,
): URLSearchParams {
  const next = new URLSearchParams(source);
  next.delete(key);
  values.forEach((value) => next.append(key, value));
  return normalizeCatalogParams(next, bounds);
}

export function setCatalogParam(
  source: URLSearchParams,
  key: "genre" | "status" | "letter" | "order" | "minYear" | "maxYear",
  value: string,
  bounds: YearBounds,
): URLSearchParams {
  const next = new URLSearchParams(source);
  const cleanValue = value.trim();
  if (cleanValue) next.set(key, cleanValue);
  else next.delete(key);
  return normalizeCatalogParams(next, bounds);
}

export function setCatalogYear(
  source: URLSearchParams,
  key: "minYear" | "maxYear",
  value: number,
  bounds: YearBounds,
): URLSearchParams {
  if (!Number.isFinite(value)) return setCatalogParam(source, key, "", bounds);
  return setCatalogParam(source, key, String(Math.trunc(value)), bounds);
}

export function setCatalogYearRange(
  source: URLSearchParams,
  value: readonly [number, number],
  bounds: YearBounds,
): URLSearchParams {
  const [rawMin, rawMax] = value;
  const clampedMin = Math.max(
    bounds.min,
    Math.min(bounds.max, Math.trunc(rawMin)),
  );
  const clampedMax = Math.max(
    bounds.min,
    Math.min(bounds.max, Math.trunc(rawMax)),
  );
  const min = Math.min(clampedMin, clampedMax);
  const max = Math.max(clampedMin, clampedMax);
  const next = new URLSearchParams(source);

  next.delete("minYear");
  next.delete("maxYear");
  if (min > bounds.min) next.set("minYear", String(min));
  if (max < bounds.max) next.set("maxYear", String(max));

  return normalizeCatalogParams(next, bounds);
}

export function countCatalogFilters(params: URLSearchParams): number {
  return (
    params.getAll("category").length +
    Number(params.has("genre")) +
    Number(params.has("status")) +
    Number(params.has("minYear") || params.has("maxYear")) +
    Number(params.has("letter"))
  );
}

/**
 * Translates canonical UI params into the catalog API query. The page and the
 * drawer preview share it, so a preview warms exactly the snapshot the page
 * requests after "Mostrar N obras".
 */
export function toCatalogApiParams(
  params: URLSearchParams,
  scope: CatalogScope,
  { page = 1 }: { page?: number } = {},
): URLSearchParams {
  const apiParams = new URLSearchParams(params);
  const q = apiParams.get("q");
  apiParams.delete("q");
  apiParams.delete("page");
  if (scope === "search" && q) apiParams.set("search", q);
  // The source's implicit order isn't "latest added" (it lags and sorts by
  // release), so the catalog asks for the order its sort menu promises.
  if (scope === "catalog" && !apiParams.has("order"))
    apiParams.set("order", "latest_added");
  apiParams.set("page", String(page));
  return apiParams;
}

export function catalogHref(pathname: string, params: URLSearchParams) {
  return `${pathname}${params.size ? `?${params}` : ""}`;
}

type CatalogMetaLike = {
  totalRecords: number;
  capped?: boolean;
};

/**
 * True when the source truncated the result set (it serves at most 1,000
 * records / 50 pages). Reads the API's `meta.capped`; older API builds don't
 * send it, in which case the total is shown as is.
 */
export function isCatalogCapped(meta: CatalogMetaLike): boolean {
  return meta.capped === true;
}

/** "1 obra", "23 obras", or "Más de 1.000 obras" for a capped result set. */
export function formatCatalogCount(totalRecords: number, capped: boolean) {
  const count = plural(totalRecords, "obra", "obras");
  return capped ? `Más de ${count}` : count;
}

export const catalogStatusOptions = [
  ["", "Cualquier estado"],
  ["emision", "En emisión"],
  ["finalizado", "Finalizado"],
  ["proximamente", "Próximamente"],
] as const;

export function letterLabel(letter: string) {
  return letter === "#" ? "#" : letter.toLocaleUpperCase("es");
}

type Taxonomy = { slug: string; name: string };

export type SelectedFilter = {
  id: string;
  key: "category" | "genre" | "status" | "years" | "letter";
  value: string;
  label: string;
};

/** Applied filters as labelled chips (also used for page titles). */
export function getSelectedFilters(
  params: URLSearchParams,
  categories: readonly Taxonomy[],
  genres: readonly Taxonomy[],
  bounds: YearBounds,
): SelectedFilter[] {
  const entries: SelectedFilter[] = [];
  for (const value of params.getAll("category")) {
    const item = categories.find((entry) => entry.slug === value);
    if (item)
      entries.push({
        id: `category:${value}`,
        key: "category",
        value,
        label: item.name,
      });
  }
  const genre = genres.find((entry) => entry.slug === params.get("genre"));
  if (genre)
    entries.push({
      id: `genre:${genre.slug}`,
      key: "genre",
      value: genre.slug,
      label: genre.name,
    });

  const status = catalogStatusOptions.find(
    ([value]) => value && value === params.get("status"),
  );
  if (status)
    entries.push({
      id: `status:${status[0]}`,
      key: "status",
      value: status[0],
      label: status[1],
    });
  if (params.has("minYear") || params.has("maxYear")) {
    const min = params.get("minYear") ?? String(bounds.min);
    const max = params.get("maxYear") ?? String(bounds.max);
    entries.push({
      id: "years:",
      key: "years",
      value: "",
      label: min === max ? min : `${min}–${max}`,
    });
  }
  const letter = params.get("letter");
  if (letter)
    entries.push({
      id: `letter:${letter}`,
      key: "letter",
      value: letter,
      label: `Inicial: ${letterLabel(letter)}`,
    });
  return entries;
}
