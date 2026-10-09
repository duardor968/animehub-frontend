import type { components } from "./generated";

export type AnimeSummary = components["schemas"]["AnimeSummaryDto"];
export type FeaturedAnime = components["schemas"]["FeaturedAnimeDto"];
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

export class ApiTimeoutError extends Error {
  constructor() {
    super("La operación superó el tiempo de espera.");
    this.name = "ApiTimeoutError";
  }
}

export class ApiResponseError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Wait the API asked for (Retry-After on 429/503), in milliseconds. */
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "ApiResponseError";
  }
}

/** Retry-After as delay-seconds or an HTTP date, in milliseconds. */
export function parseRetryAfter(
  value: string | null | undefined,
  now = Date.now(),
): number | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw) * 1_000;
  const date = Date.parse(raw);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

const ipLike = /^[0-9A-Fa-f:.]{2,45}$/;

/**
 * The visitor's address as seen by the web server: Cloudflare's
 * cf-connecting-ip, then x-real-ip, then the last x-forwarded-for hop (the one
 * appended by our own proxy; earlier entries are client-supplied).
 */
export function visitorAddress(headers: Pick<Headers, "get">): string | null {
  const candidates = [
    headers.get("cf-connecting-ip"),
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for")?.split(",").at(-1),
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value && ipLike.test(value)) return value;
  }
  return null;
}

/**
 * Server-side requests carry the visitor's address so the API (with
 * TRUST_PROXY set to this server) rate-limits per visitor instead of per web
 * server. Outside a request (build, static generation, tests) there is no
 * visitor: nothing is forwarded.
 */
async function incomingVisitorAddress(): Promise<string | null> {
  try {
    const [{ headers }, { unstable_rethrow }] = await Promise.all([
      import("next/headers"),
      import("next/navigation"),
    ]);
    try {
      return visitorAddress(await headers());
    } catch (error) {
      // Next's own signals (dynamic usage while prerendering) must propagate.
      unstable_rethrow(error);
      return null;
    }
  } catch {
    return null;
  }
}

export function isApiNotFoundError(error: unknown): error is ApiResponseError {
  return error instanceof ApiResponseError && error.status === 404;
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
  options: { timeoutMs?: number; retryDelays?: readonly number[] } = {},
): Promise<T> {
  const controller =
    options.timeoutMs === undefined ? null : new AbortController();
  const signal = controller?.signal ?? init.signal;
  const relayAbort = () => controller?.abort(init.signal?.reason);
  if (init.signal?.aborted) relayAbort();
  else init.signal?.addEventListener("abort", relayAbort, { once: true });
  const timeout = controller
    ? setTimeout(
        () =>
          controller.abort(
            new DOMException("API deadline exceeded", "TimeoutError"),
          ),
        options.timeoutMs,
      )
    : undefined;
  const method = init.method?.toUpperCase() ?? "GET";
  const retryDelays =
    options.retryDelays ??
    (!client && method === "GET" ? [0, 400, 900, 1_600, 2_400] : [0]);
  // A request that opts into Next's data cache (`next.revalidate`) is shared
  // by every visitor: it carries no visitor address and no "no-store".
  const cacheable = init.next?.revalidate !== undefined;
  const forwardedFor =
    !client && !cacheable && typeof window === "undefined"
      ? await incomingVisitorAddress()
      : null;
  try {
    let response: Response | null = null;
    for (const [attempt, delay] of retryDelays.entries()) {
      signal?.throwIfAborted();
      if (delay) await abortableDelay(delay, signal);
      try {
        const headers = new Headers(init.headers);
        if (!headers.has("accept")) headers.set("accept", "application/json");
        if (init.body && !headers.has("content-type")) {
          headers.set("content-type", "application/json");
        }
        if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);
        response = await withAbort(
          fetch(`${apiBase(client)}${path}`, {
            ...init,
            headers,
            signal,
            cache: init.cache ?? (cacheable ? undefined : "no-store"),
          }),
          signal,
        );
        break;
      } catch (error) {
        signal?.throwIfAborted();
        if (
          hasErrorName(error, "TimeoutError") ||
          hasErrorName(error, "AbortError")
        ) {
          throw error;
        }
        if (attempt === retryDelays.length - 1) throw new ApiConnectionError();
      }
    }
    if (!response) throw new ApiConnectionError();
    if (!response.ok) {
      const problem = (await withAbort(response.json(), signal).catch(
        (error: unknown) => {
          signal?.throwIfAborted();
          if (hasErrorName(error, "TimeoutError")) throw error;
          return null;
        },
      )) as { detail?: string; message?: string } | null;
      throw new ApiResponseError(
        response.status,
        problem?.detail ?? problem?.message ?? `API error ${response.status}`,
        parseRetryAfter(response.headers?.get("retry-after")),
      );
    }
    return await withAbort(response.json() as Promise<T>, signal);
  } catch (error) {
    // Preserve the existing shared-client error contract for downloads too.
    // Home callers still distinguish their own cancellation via their signal.
    if (
      hasErrorName(error, "TimeoutError") ||
      hasErrorName(error, "AbortError")
    ) {
      throw new ApiTimeoutError();
    }
    throw error;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    init.signal?.removeEventListener("abort", relayAbort);
  }
}

function hasErrorName(error: unknown, name: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === name
  );
}

function withAbort<T>(
  promise: Promise<T>,
  signal?: AbortSignal | null,
): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function abortableDelay(delay: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const timer = setTimeout(finish, delay);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason);
    };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}
