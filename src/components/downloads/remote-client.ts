import type { components } from "@/lib/api/generated";
import {
  apiBase,
  apiFetch,
  ApiResponseError,
  type EpisodePageResponse,
} from "@/lib/api/client";
import { formatEpisodeNumber, formatNumber } from "@/lib/format";
import type { DownloadRequest } from "./download-types";

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
            ? "El código no está disponible. Genera otro en AnimeHub para PC."
            : "El PC ya no está vinculado a este navegador."
          : error.status === 409
            ? path.endsWith("/cancel")
              ? "El PC ya recibió la solicitud; no se puede cancelar desde aquí."
              : "El perfil de descarga cambió. Actualiza los dispositivos y vuelve a elegir el destino."
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
/** What the API says changed: the linked PCs or the requests sent. */
export type RemoteChange = "devices" | "requests";
// The API sends a heartbeat every 25 s; a silent minute is a dead connection.
const channelIdle = 60000;
/** The live channel of this browser's session: `open` once connected, then
 *  `change` for each event, until the API closes it (resolves), the
 *  connection fails or `signal` aborts (rejects). */
async function events(
  on: { open: () => void; change: (type: RemoteChange) => void },
  signal: AbortSignal,
): Promise<void> {
  const capability = token();
  if (!capability)
    throw new ApiResponseError(401, "Este navegador no está vinculado.");
  const connection = new AbortController();
  const abort = () => connection.abort();
  signal.addEventListener("abort", abort, { once: true });
  let idle: ReturnType<typeof setTimeout> | undefined;
  const alive = () => {
    clearTimeout(idle);
    idle = setTimeout(abort, channelIdle);
  };
  try {
    alive();
    const response = await fetch(`${apiBase(true)}/remote/events`, {
      headers: {
        Authorization: `Bearer ${capability}`,
        Accept: "text/event-stream",
      },
      cache: "no-store",
      signal: connection.signal,
    });
    if (!response.ok || !response.body) {
      if (response.status === 401) localStorage.removeItem(sessionKey);
      throw new ApiResponseError(
        response.status,
        `API error ${response.status}`,
      );
    }
    on.open();
    const reader = response.body
      .pipeThrough(new TextDecoderStream())
      .getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      alive();
      const blocks = (buffer + value).split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const type = /^event: ?(.+)$/m.exec(block)?.[1].trim();
        if (type === "devices" || type === "requests") on.change(type);
      }
    }
  } finally {
    clearTimeout(idle);
    signal.removeEventListener("abort", abort);
  }
}
export const remoteClient = {
  events,
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
export function remoteTarget(devices: RemoteDevice[], preferred: string) {
  return devices.length === 1
    ? devices[0]
    : preferred === "ask"
      ? undefined
      : devices.find((d) => d.id === preferred);
}
// What the PC (local_*) or the API recorded when it set a request aside.
const attentionReasons: Record<string, (name: string) => string> = {
  local_profile_unavailable: (name) => `${name} cambió su perfil de descarga`,
  "Destination profile changed": (name) =>
    `${name} cambió su perfil de descarga`,
  local_record_unavailable: (name) =>
    `${name} no pudo añadir el anime a su biblioteca`,
};
export function attentionReason(reason: string | null, name: string) {
  const why = reason ? attentionReasons[reason] : undefined;
  return why
    ? `No se descargará · ${why(name)}; vuelve a enviarla`
    : `Requiere atención en ${name}`;
}
/** "Ep. 1, 2", or "12 episodios" past six. */
export function requestEpisodes(request: RemoteRequest) {
  return request.episodeNumbers.length > 6
    ? `${formatNumber(request.episodeNumbers.length)} episodios`
    : `Ep. ${request.episodeNumbers.map(formatEpisodeNumber).join(", ")}`;
}
/** What a request asks for: "Series · Ep. 1, 2". */
export function requestLabel(request: RemoteRequest) {
  return `${request.animeTitle ?? "Título no disponible"} · ${requestEpisodes(request)}`;
}
/** Where a request stands, for the PC named. `sending`: just sent to that PC
 *  while connected, and not yet past the wait for it to take it. */
export function remoteStatus(
  request: RemoteRequest,
  name: string,
  offline = false,
  sending = false,
) {
  if (request.status === "accepted") return `Recibida por ${name} · En cola`;
  if (request.status === "cancelled") return `Solicitud cancelada · ${name}`;
  if (request.status === "requires_attention")
    return attentionReason(request.reason, name);
  if (offline) return `Pendiente de entrega · ${name} sin conexión`;
  return sending ? `Enviando a ${name}…` : `Pendiente de entrega · ${name}`;
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
