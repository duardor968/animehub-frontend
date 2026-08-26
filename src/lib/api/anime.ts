import { apiFetch, isApiNotFoundError, type AnimeResponse } from "./client";

type FetchAnime = (path: string) => Promise<AnimeResponse>;

const fetchAnime: FetchAnime = (path) => apiFetch<AnimeResponse>(path);

export async function loadAnime(
  slug: string,
  fetcher: FetchAnime = fetchAnime,
): Promise<AnimeResponse | null> {
  try {
    return await fetcher(`/anime/${encodeURIComponent(slug)}`);
  } catch (error) {
    if (isApiNotFoundError(error)) return null;
    throw error;
  }
}
