import { ApiTimeoutError, apiFetch, type HomeResponse } from "./client";

export const HOME_API_TIMEOUT_MS = 3_000;

export async function fetchHome(
  client = false,
  signal?: AbortSignal,
): Promise<HomeResponse> {
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  let outcome = "unavailable";
  try {
    const response = await apiFetch<HomeResponse>(
      "/home",
      { signal, headers: { "x-request-id": requestId } },
      client,
      { timeoutMs: HOME_API_TIMEOUT_MS, retryDelays: [0] },
    );
    if (
      !response?.meta ||
      !Array.isArray(response?.data?.featured) ||
      !Array.isArray(response?.data?.recentEpisodes) ||
      !Array.isArray(response?.data?.recentAnime)
    ) {
      throw new Error("Invalid home response");
    }
    outcome = "ok";
    return response;
  } catch (error) {
    if (error instanceof ApiTimeoutError) outcome = "timeout";
    throw error;
  } finally {
    if (!client) {
      // Deliberately exclude source errors, headers, URLs and payloads.
      console.info(
        JSON.stringify({
          event: "home_ssr_api",
          path: "/home",
          requestId,
          durationMs: Math.round(performance.now() - startedAt),
          outcome,
        }),
      );
    }
  }
}
