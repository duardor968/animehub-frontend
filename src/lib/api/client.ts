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
  const response = await fetch(`${apiBase(client)}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    cache: init.cache ?? "no-store",
  });
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as {
      detail?: string;
      message?: string;
    } | null;
    throw new Error(
      problem?.detail ?? problem?.message ?? `API error ${response.status}`,
    );
  }
  return response.json() as Promise<T>;
}
