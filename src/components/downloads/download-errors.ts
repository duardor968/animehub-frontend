import {
  ApiConnectionError,
  ApiResponseError,
  ApiTimeoutError,
} from "@/lib/api/client";

export interface FriendlyError {
  title: string;
  detail: string;
}

/**
 * Click'n'Load failures, classified so the UI can say what happened and
 * whether a retry could duplicate links (`maybeDelivered`).
 */
export type ClickNLoadFailure =
  /** Nothing answered on 127.0.0.1:9666 (closed, or blocked by the browser). */
  | "unreachable"
  /** Port 9666 answered but it isn't JDownloader. */
  | "identity"
  /** The health check timed out: nothing was sent. */
  | "timeout"
  /** JDownloader answered the link submission with an HTTP error. */
  | "rejected"
  /** The submission was sent but no answer arrived: it may have worked. */
  | "uncertain";

export class ClickNLoadError extends Error {
  constructor(
    readonly kind: ClickNLoadFailure,
    message = "Click'n'Load failed",
  ) {
    super(message);
    this.name = "ClickNLoadError";
  }

  get maybeDelivered() {
    return this.kind === "uncertain";
  }
}

export function describeClickNLoadError(error: unknown): FriendlyError {
  const kind = error instanceof ClickNLoadError ? error.kind : "unreachable";
  switch (kind) {
    case "identity":
      return {
        title: "JDownloader no respondió",
        detail:
          "Otro programa está usando el puerto 9666. Cierra ese programa o usa otro destino.",
      };
    case "timeout":
      return {
        title: "JDownloader no respondió",
        detail:
          "Tardó más de 8 segundos. Comprueba que JDownloader esté abierto y vuelve a intentarlo.",
      };
    case "rejected":
      return {
        title: "JDownloader rechazó los enlaces",
        detail:
          "Revisa que Click'n'Load esté activo en JDownloader y vuelve a intentarlo.",
      };
    case "uncertain":
      return {
        title: "Entrega sin confirmar",
        detail:
          "Se enviaron los enlaces pero JDownloader no confirmó la recepción. Revisa LinkGrabber antes de reintentar para no duplicarlos.",
      };
    default:
      return {
        title: "No se pudo conectar con JDownloader",
        detail:
          "Abre JDownloader en este equipo con Click'n'Load activo (puerto 9666). Si el navegador pide permiso para acceder a la red local, acéptalo.",
      };
  }
}

const knownApiDetails: Array<[RegExp, string]> = [
  [/no episodes match/i, "Ningún episodio coincide con los números indicados."],
  [/no failed episodes/i, "No quedan episodios fallidos por reintentar."],
  [/anime not found/i, "Este anime ya no está disponible."],
];

/** Maps API Problem Details, status codes and network failures to Spanish. */
export function describeApiError(error: unknown): FriendlyError {
  if (error instanceof ApiTimeoutError) {
    return {
      title: "La fuente tardó demasiado",
      detail: "AnimeAV1 no respondió a tiempo. No se envió nada.",
    };
  }
  if (error instanceof ApiConnectionError || isNetworkError(error)) {
    return {
      title: "Sin conexión con AnimeHub",
      detail: "Comprueba tu conexión a internet y vuelve a intentarlo.",
    };
  }
  if (error instanceof ApiResponseError) {
    const known = knownApiDetails.find(([pattern]) =>
      pattern.test(error.message),
    );
    if (error.status === 401) {
      return {
        title: "La descarga caducó",
        detail: "Vuelve a iniciarla para obtener enlaces actuales.",
      };
    }
    if (error.status === 404) {
      return {
        title: "No encontrado",
        detail: known?.[1] ?? "El recurso ya no está disponible.",
      };
    }
    if (error.status === 429) {
      return {
        title: "Demasiadas solicitudes",
        detail: "Espera unos segundos y vuelve a intentarlo.",
      };
    }
    if (error.status === 503 || error.status === 502 || error.status === 504) {
      return {
        title: "AnimeAV1 no está disponible",
        detail: "La fuente no responde ahora mismo. Inténtalo en unos minutos.",
      };
    }
    if (error.status >= 500) {
      return {
        title: "Error del servidor",
        detail: "AnimeHub no pudo completar la operación. Vuelve a intentarlo.",
      };
    }
    return {
      title: "Solicitud no válida",
      detail:
        known?.[1] ?? "Revisa los episodios elegidos y vuelve a intentarlo.",
    };
  }
  return {
    title: "Algo salió mal",
    detail: "No se pudo completar la operación. Vuelve a intentarlo.",
  };
}

function isNetworkError(error: unknown) {
  return error instanceof TypeError;
}

interface MyJdErrorLike {
  message?: unknown;
  cause?: unknown;
}

function myJdErrorType(error: unknown): string | null {
  const cause = (error as MyJdErrorLike | null)?.cause;
  if (cause && typeof cause === "object" && "type" in cause) {
    const type = (cause as { type?: unknown }).type;
    return typeof type === "string" ? type : null;
  }
  return null;
}

function myJdStatus(error: unknown): number | null {
  const message = (error as MyJdErrorLike | null)?.message;
  if (typeof message !== "string") return null;
  const match = /^(\d{3}):/.exec(message);
  return match ? Number(match[1]) : null;
}

/** jdownloader-connect throws `Error("403: Forbidden", { cause: {type} })`
 *  or a bare TypeError; this turns those into actionable Spanish copy. */
export function describeMyJdError(error: unknown): string {
  if (error instanceof MyJdDeviceError) return error.message;
  const type = myJdErrorType(error);
  const status = myJdStatus(error);
  if (type === "AUTH_FAILED" || type === "EMAIL_INVALID" || status === 403)
    return "Correo o contraseña incorrectos.";
  if (type === "ERROR_EMAIL_NOT_CONFIRMED")
    return "Confirma tu correo de MyJDownloader antes de conectar.";
  if (type === "TOO_MANY_REQUESTS" || status === 429)
    return "Demasiados intentos. Espera un minuto y vuelve a intentarlo.";
  if (type === "TOKEN_INVALID" || type === "SESSION" || status === 401)
    return "La sesión de MyJDownloader caducó. Vuelve a conectar tu cuenta.";
  if (type === "OFFLINE")
    return "El dispositivo está desconectado. Abre JDownloader en ese equipo.";
  if (
    type === "MAINTENANCE" ||
    type === "OVERLOAD" ||
    (status !== null && status >= 500)
  )
    return "MyJDownloader no responde ahora mismo. Inténtalo más tarde.";
  if (error instanceof TypeError || status === null)
    return "No se pudo contactar con MyJDownloader. Revisa tu conexión.";
  return "MyJDownloader no aceptó la solicitud. Vuelve a intentarlo.";
}

/** Errors raised by our own MyJD helpers, already written for users. */
export class MyJdDeviceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MyJdDeviceError";
  }
}
