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
  "title-asc",
  "title-desc",
  "score-desc",
  "date-desc",
]);

export const catalogApiYearBounds = { min: 1900, max: 2200 } as const;

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
): string | null {
  if (!value || !/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  if (!Number.isSafeInteger(year) || year < bounds.min || year > bounds.max)
    return null;
  return String(year);
}

function appendUniqueSorted(
  target: URLSearchParams,
  source: URLSearchParams,
  key: "category" | "genre",
) {
  const values = [...new Set(source.getAll(key).map((value) => value.trim()))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "es"));
  values.forEach((value) => target.append(key, value));
}

export function normalizeCatalogParams(
  source: URLSearchParams,
  bounds: YearBounds,
  { keepPage = false }: { keepPage?: boolean } = {},
): URLSearchParams {
  const normalized = new URLSearchParams();
  const q = normalizeText(source.get("q"))?.slice(0, 100) ?? null;
  const order = normalizeText(source.get("order"));
  const letter = normalizeText(source.get("letter"));
  const status = normalizeText(source.get("status"));
  const minYear = normalizeYear(source.get("minYear"), bounds);
  const maxYear = normalizeYear(source.get("maxYear"), bounds);

  if (q) normalized.set("q", q);
  appendUniqueSorted(normalized, source, "category");
  appendUniqueSorted(normalized, source, "genre");
  if (status && supportedStatus.has(status)) normalized.set("status", status);
  if (minYear) normalized.set("minYear", minYear);
  if (maxYear) normalized.set("maxYear", maxYear);
  if (letter) normalized.set("letter", letter.slice(0, 1));
  if (order && supportedOrder.has(order)) normalized.set("order", order);

  if (keepPage) {
    const page = Number(source.get("page"));
    if (Number.isSafeInteger(page) && page > 1 && page <= 500)
      normalized.set("page", String(page));
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
  key: "category" | "genre",
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

export function setCatalogParam(
  source: URLSearchParams,
  key: "status" | "order" | "minYear" | "maxYear",
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

export function validateYearRange(params: URLSearchParams): string | null {
  const minYear = Number(params.get("minYear"));
  const maxYear = Number(params.get("maxYear"));
  if (
    params.has("minYear") &&
    params.has("maxYear") &&
    Number.isFinite(minYear) &&
    Number.isFinite(maxYear) &&
    minYear > maxYear
  ) {
    return "El año inicial no puede ser posterior al año final.";
  }
  return null;
}

export function countCatalogFilters(params: URLSearchParams): number {
  return (
    params.getAll("category").length +
    params.getAll("genre").length +
    Number(params.has("status")) +
    Number(params.has("minYear") || params.has("maxYear")) +
    Number(params.has("letter"))
  );
}

export function toCatalogApiParams(params: URLSearchParams): URLSearchParams {
  const apiParams = new URLSearchParams(params);
  const q = apiParams.get("q");
  apiParams.delete("q");
  apiParams.delete("page");
  if (q) apiParams.set("search", q);
  apiParams.set("page", "1");
  return apiParams;
}
