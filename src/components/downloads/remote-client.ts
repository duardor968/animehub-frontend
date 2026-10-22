import type { components } from "@/lib/api/generated";
import {
  apiFetch,
  ApiResponseError,
  type EpisodePageResponse,
} from "@/lib/api/client";
import type { DownloadRequest } from "./download-types";

export type RemoteProfile = components["schemas"]["DestinationProfileDto"];
export type RemoteDevice = components["schemas"]["RemoteDeviceDto"];
export type RemoteRequest = components["schemas"]["RemoteRequestDto"];
export type RemoteRequestInput =
  components["schemas"]["CreateRemoteRequestDto"];
const sessionKey = "animehub.remote.session.v1";
let sessionCreation: Promise<string> | null = null;

function token() {
  return localStorage.getItem(sessionKey);
}
export function hasRemoteSession() {
  try {
    return Boolean(token());
  } catch {
    return false;
  }
}
async function session(): Promise<string> {
  const existing = token();
  if (existing) return existing;
  if (!sessionCreation)
    sessionCreation = apiFetch<{ id: string; token: string }>(
      "/remote/sessions",
      { method: "POST" },
      true,
      { timeoutMs: 15000 },
    )
      .then((result) => {
        localStorage.setItem(sessionKey, result.token);
        return result.token;
      })
      .finally(() => {
        sessionCreation = null;
      });
  return sessionCreation;
}
async function remote<T>(path: string, init: RequestInit = {}): Promise<T> {
  const capability = await session();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${capability}`);
  try {
    return await apiFetch<T>(`/remote${path}`, { ...init, headers }, true, {
      timeoutMs: 15000,
    });
  } catch (error) {
    if (error instanceof ApiResponseError && error.status === 401)
      localStorage.removeItem(sessionKey);
    if (error instanceof ApiResponseError) {
      const message =
        error.status === 404
          ? path === "/links"
            ? "El código no está disponible. Genera otro en AnimeHub Desktop."
            : "El PC ya no está vinculado a este navegador."
          : error.status === 409
            ? path.endsWith("/cancel")
              ? "El PC ya recibió la solicitud; no se puede cancelar desde aquí."
              : "El perfil de descarga cambió. Actualiza los equipos y vuelve a elegir el destino."
            : error.status === 429
              ? "Demasiados intentos. Espera unos minutos y vuelve a intentarlo."
              : error.status >= 500
                ? "AnimeHub no pudo completar la operación. Inténtalo de nuevo."
                : error.message;
      throw new ApiResponseError(error.status, message, error.retryAfterMs);
    }
    throw error;
  }
}
export const remoteClient = {
  devices: () => remote<{ devices: RemoteDevice[] }>("/devices"),
  requests: () => remote<{ requests: RemoteRequest[] }>("/requests"),
  link: (code: string) =>
    remote<{ deviceId: string }>("/links", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  unlink: (id: string) =>
    remote<{ deviceId: string; revoked: boolean }>(
      `/links/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
  create: (body: RemoteRequestInput, key: string) =>
    remote<RemoteRequest>("/requests", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(body),
    }),
  cancel: (id: string) =>
    remote<RemoteRequest>(`/requests/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
    }),
};
export function remoteOnline(device: RemoteDevice, now = Date.now()) {
  return now - Date.parse(device.lastSeenAt) < 90000;
}
export function remoteTarget(devices: RemoteDevice[], preferred: string) {
  return devices.length === 1
    ? devices[0]
    : preferred === "ask"
      ? undefined
      : devices.find((d) => d.id === preferred);
}
export async function remoteEpisodeNumbers(
  request: DownloadRequest,
): Promise<number[]> {
  if (request.episodeNumbers?.length)
    return [...new Set(request.episodeNumbers)];
  const numbers: number[] = [];
  let page = 1;
  let pages = 1;
  do {
    const result = await apiFetch<EpisodePageResponse>(
      `/anime/${encodeURIComponent(request.slug)}/episodes?page=${page}`,
      {},
      true,
      { timeoutMs: 15000 },
    );
    numbers.push(...result.data.map((e) => e.number));
    pages = result.meta.totalPages;
    page++;
  } while (page <= pages);
  return [...new Set(numbers)].filter(
    (number) =>
      request.all ||
      ((request.from === undefined || number >= request.from) &&
        (request.to === undefined || number <= request.to)),
  );
}
