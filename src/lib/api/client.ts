import type { components } from "./generated";

export type AnimeSummary = components["schemas"]["AnimeSummaryDto"];
export type Episode = components["schemas"]["EpisodeDto"];
export type HomeResponse = components["schemas"]["HomeResponseDto"];
export type CatalogResponse = components["schemas"]["CatalogResponseDto"];
export type AnimeResponse = components["schemas"]["AnimeResponseDto"];
export type EpisodePageResponse =
  components["schemas"]["EpisodePageResponseDto"];
export type ScheduleResponse = components["schemas"]["ScheduleResponseDto"];
export type ResolveDownloadsResponse =
  components["schemas"]["ResolveDownloadsResponseDto"];
export type DownloadJobResponse =
  components["schemas"]["DownloadJobResponseDto"];

export class ApiConnectionError extends Error {
  constructor() {
    super("AnimeHub API is unavailable.");
    this.name = "ApiConnectionError";
  }
}

export class ApiResponseError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiResponseError";
  }
}

export function apiBase(client = false) {
  if (client) {
    return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
  }
  return (
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:8000/api/v1"
  );
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  client = false,
): Promise<T> {
  const method = init.method?.toUpperCase() ?? "GET";
  const retryDelays =
    !client && method === "GET" ? [0, 400, 900, 1_600, 2_400] : [0];
  let response: Response | null = null;
  for (const delay of retryDelays) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      response = await fetch(`${apiBase(client)}${path}`, {
        ...init,
        headers: {
          accept: "application/json",
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...init.headers,
        },
        cache: init.cache ?? "no-store",
      });
      break;
    } catch {
      if (delay === retryDelays.at(-1)) throw new ApiConnectionError();
    }
  }
  if (!response) throw new ApiConnectionError();
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as {
      detail?: string;
      message?: string;
    } | null;
    throw new ApiResponseError(
      response.status,
      problem?.detail ?? problem?.message ?? `API error ${response.status}`,
    );
  }
  return response.json() as Promise<T>;
}
