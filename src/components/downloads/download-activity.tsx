import { Button, ProgressBar } from "@heroui/react";
import { formatNumber, plural } from "@/lib/format";
import {
  countLinks,
  describeAudioFallback,
  describeEpisodes,
  describeFailed,
  describeMissing,
  describeLinks,
  failedEpisodeNumbers,
  type ResolvedEpisodeLike,
} from "./download-copy";
import type { FriendlyError } from "./download-errors";
import type {
  AudioPreference,
  DownloadActivityStatus,
  DownloadDestination,
  DownloadProviderId,
  DownloadRequest,
} from "./download-types";

export interface ResolvedEpisode extends ResolvedEpisodeLike {
  audio: AudioPreference;
  links: Array<{ provider: DownloadProviderId; url: string }>;
  errorCode?: string | null;
}

export interface SavedJob {
  jobId: string;
  accessToken: string;
  expiresAt: string;
}

export interface Activity {
  id: string;
  /** requestKey(request): identifies repeated requests for de-duplication. */
  key: string;
  request: DownloadRequest;
  status: DownloadActivityStatus;
  current: number;
  total: number;
  packageName: string;
  episodes: ResolvedEpisode[];
  receipt?: SavedJob;
  destination: DownloadDestination;
  preferredAudio: AudioPreference;
  createdAt: number;
  /** Resolved by a background job (ranges, whole series, big selections). */
  isJob: boolean;
  deliveryAttempted?: boolean;
  /** The last delivery attempt ended with a definitive failure. */
  deliveryFailed?: boolean;
  /** User-facing reason for an error or a failed delivery. */
  failure?: FriendlyError;
  /** A reload interrupted a delivery that may or may not have arrived. */
  interrupted?: boolean;
  restored?: boolean;
  reconnecting?: boolean;
  cancelling?: boolean;
  retrying?: boolean;
  /** COPY destination: the browser blocked the clipboard without a gesture. */
  copyBlocked?: boolean;
  deliveredVia?: DownloadDestination;
  failedCount?: number;
  /** After "Reintentar fallidos", only these episodes are delivered. */
  onlyEpisodes?: number[];
  /** The resolve finished but no provider had links. */
  noLinks?: boolean;
  /** Requested numbers the anime doesn't have (skipped by the job). */
  missingNumbers?: number[];
  /** Only this provider's links were copied (episode copy menu). */
  provider?: DownloadProviderId;
  /** False when repeating the same request can't work (a 4xx such as a
   *  validation error): the error then offers no "Reintentar". */
  retryable?: boolean;
  /** Idempotency-Key of a job request whose outcome is unknown, reused by
   *  "Reintentar" so the API returns that job instead of a second one. */
  retryKey?: string;
}

export type ActivityAction =
  | "cancel"
  | "deliver"
  | "copy"
  | "show-links"
  | "use-myjd"
  | "use-cnl"
  | "choose-device"
  | "retry"
  | "retry-failed"
  | "preferences";

export interface ActivityView {
  /** What happened or is happening; the toast's title names the request. */
  title: string;
  variant: "default" | "accent" | "success" | "warning" | "danger";
  isLoading: boolean;
  /** Auto-dismiss delay; 0 keeps the toast until the user acts. */
  timeout: number;
  detail?: string;
  progress?: { current: number; total: number };
  actions: Array<{
    id: ActivityAction;
    label: string;
    primary?: boolean;
    isPending?: boolean;
  }>;
}

export const activeStatuses = new Set<DownloadActivityStatus>([
  "resolving",
  "processing",
  "sending",
]);

/** Statuses that still need the user (or a running job) to finish. */
export const unfinishedStatuses = new Set<DownloadActivityStatus>([
  "resolving",
  "processing",
  "sending",
  "waiting-device",
  "ready",
]);

const destinationNames: Record<Exclude<DownloadDestination, "COPY">, string> = {
  CNL: "JDownloader",
  MYJD: "MyJDownloader",
};

export function deliverableEpisodes(activity: Activity) {
  const only = activity.onlyEpisodes;
  return only
    ? activity.episodes.filter((episode) =>
        only.includes(episode.episodeNumber),
      )
    : activity.episodes;
}

function deliverLabel(destination: DownloadDestination) {
  return destination === "COPY"
    ? "Copiar enlaces"
    : `Enviar a ${destinationNames[destination]}`;
}

/** "4 enlaces copiados", "1 enlace de Mega copiado", "4 enlaces enviados a
 *  JDownloader". */
export function deliveredSentence(
  episodes: ResolvedEpisodeLike[],
  via: DownloadDestination,
  provider?: DownloadProviderId,
) {
  const one = countLinks(episodes) === 1;
  const links = describeLinks(episodes, provider);
  return via === "COPY"
    ? `${links} ${one ? "copiado" : "copiados"}`
    : `${links} ${one ? "enviado" : "enviados"} a ${destinationNames[via]}`;
}

/** "14 de 1180": the progress count, formatted like every other count. */
export function formatProgress(current: number, total: number) {
  return `${formatNumber(current)} de ${formatNumber(total)}`;
}

const sentences = (...parts: Array<string | undefined>) =>
  parts.filter(Boolean).join(" ") || undefined;

export function presentActivity(
  activity: Activity,
  { portable }: { portable: boolean },
): ActivityView {
  const episodes = deliverableEpisodes(activity);
  const one = countLinks(episodes) === 1;
  const base = { isLoading: false, actions: [] };
  const alternativeDestination: ActivityView["actions"] = [];
  if (activity.destination !== "COPY")
    alternativeDestination.push({ id: "copy", label: "Copiar enlaces" });
  if (activity.destination === "CNL")
    alternativeDestination.push({
      id: "use-myjd",
      label: "Usar MyJDownloader",
    });
  if (activity.destination === "MYJD" && !portable)
    alternativeDestination.push({ id: "use-cnl", label: "Usar Click'n'Load" });

  switch (activity.status) {
    case "resolving":
      return {
        ...base,
        title: activity.isJob ? "Preparando la descarga" : "Buscando enlaces",
        variant: "accent",
        isLoading: true,
        timeout: 0,
        actions: [{ id: "cancel", label: "Cancelar" }],
      };
    case "processing":
      return {
        ...base,
        title: activity.reconnecting
          ? "Reconectando con AnimeHub"
          : activity.restored
            ? "Reanudando la descarga"
            : "Buscando enlaces",
        detail: sentences(describeMissing(activity.missingNumbers)),
        variant: "accent",
        isLoading: true,
        timeout: 0,
        progress:
          activity.total > 0
            ? { current: activity.current, total: activity.total }
            : undefined,
        actions: [
          {
            id: "cancel",
            label: activity.cancelling ? "Cancelando…" : "Cancelar",
            isPending: activity.cancelling,
          },
        ],
      };
    case "sending":
      return {
        ...base,
        title:
          activity.destination === "COPY"
            ? "Copiando enlaces"
            : `Enviando a ${destinationNames[activity.destination]}`,
        variant: "accent",
        isLoading: true,
        timeout: 0,
      };
    case "waiting-device":
      return {
        ...base,
        title: "Elige un dispositivo",
        variant: "accent",
        timeout: 0,
        actions: [
          { id: "choose-device", label: "Elegir dispositivo", primary: true },
          ...alternativeDestination.filter((entry) => entry.id !== "use-myjd"),
        ],
      };
    case "ready": {
      if (activity.copyBlocked) {
        return {
          ...base,
          title: `${describeLinks(episodes)} ${one ? "listo" : "listos"} para copiar`,
          detail: `El navegador no permitió ${one ? "copiarlo" : "copiarlos"} automáticamente.`,
          variant: "accent",
          timeout: 0,
          actions: [
            { id: "copy", label: "Copiar enlaces", primary: true },
            { id: "show-links", label: "Ver enlaces" },
          ],
        };
      }
      if (activity.failure) {
        return {
          ...base,
          title: activity.failure.title,
          detail: activity.failure.detail,
          variant: "warning",
          timeout: 0,
          actions: [
            { id: "deliver", label: "Reintentar", primary: true },
            ...alternativeDestination,
          ],
        };
      }
      if (activity.interrupted) {
        return {
          ...base,
          title: "Entrega sin confirmar",
          detail:
            "La página se recargó mientras se enviaban los enlaces. Revisa LinkGrabber antes de reintentar para no duplicarlos.",
          variant: "warning",
          timeout: 0,
          actions: [
            { id: "deliver", label: "Reintentar", primary: true },
            ...alternativeDestination.filter((entry) => entry.id === "copy"),
          ],
        };
      }
      return {
        ...base,
        title: `${describeLinks(episodes)} ${one ? "listo" : "listos"}`,
        detail: activity.deliveryFailed ? "El último envío falló." : undefined,
        variant: "accent",
        timeout: 0,
        actions: [
          {
            id: "deliver",
            label: deliverLabel(activity.destination),
            primary: true,
          },
          ...alternativeDestination.filter((entry) => entry.id === "copy"),
        ],
      };
    }
    case "handed-off": {
      const fallback = describeAudioFallback(episodes, activity.preferredAudio);
      return {
        ...base,
        title: deliveredSentence(
          episodes,
          activity.deliveredVia ?? "CNL",
          activity.provider,
        ),
        detail: sentences(fallback, describeMissing(activity.missingNumbers)),
        variant: "success",
        timeout: fallback ? 9_000 : 6_000,
      };
    }
    case "partial": {
      const delivered = episodes.filter((episode) => episode.links.length > 0);
      return {
        ...base,
        title: "Entrega parcial",
        detail: sentences(
          `${deliveredSentence(delivered, activity.deliveredVia ?? "CNL", activity.provider)}.`,
          describeFailed(
            failedEpisodeNumbers(episodes),
            activity.failedCount,
            episodes,
          ),
          describeAudioFallback(delivered, activity.preferredAudio),
          describeMissing(activity.missingNumbers),
        ),
        variant: "warning",
        timeout: 0,
        actions: [
          {
            id: "retry-failed",
            label: activity.retrying ? "Reintentando…" : "Reintentar fallidos",
            primary: true,
            isPending: activity.retrying,
          },
          ...(activity.deliveredVia === "COPY"
            ? []
            : [{ id: "copy" as const, label: "Copiar enlaces" }]),
        ],
      };
    }
    case "cancelled":
      return {
        ...base,
        title: "Descarga cancelada",
        detail: "No se envió ningún enlace.",
        variant: "default",
        timeout: 5_000,
      };
    case "error":
    default:
      if (activity.noLinks) {
        return {
          ...base,
          title: "No hay enlaces disponibles",
          detail: "Ningún proveedor activo tiene este contenido.",
          variant: "danger",
          timeout: 12_000,
          actions: [{ id: "preferences", label: "Abrir preferencias" }],
        };
      }
      return {
        ...base,
        title: activity.failure?.title ?? "No se pudo preparar la descarga",
        detail:
          activity.failure?.detail ??
          "No se pudo completar la operación. Vuelve a intentarlo.",
        variant: "danger",
        timeout: 12_000,
        // A rejected request (validation) would fail again: no retry.
        actions:
          activity.receipt || activity.retryable === false
            ? []
            : [{ id: "retry", label: "Reintentar", primary: true }],
      };
  }
}

/** A download toast's title, "One Piece · Ep. 4–5": a long anime title is
 *  clamped, the episodes always show. A movie is its title alone. */
export function RequestTitle({ request }: { request: DownloadRequest }) {
  if (request.movie) return request.title;
  return (
    <span className="flex min-w-0">
      <span className="min-w-0 truncate">{request.title}</span>
      <span className="shrink-0">{` · ${describeEpisodes(request)}`}</span>
    </span>
  );
}

/** Toast body (the toast renders its description as a div). Actions go
 *  through the callback: the toast region sits outside the download context. */
export function ActivityToastBody({
  view,
  onAction,
}: {
  view: ActivityView;
  onAction: (action: ActivityAction) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p>{view.title}</p>
      {view.detail && <p>{view.detail}</p>}
      {view.progress && <ToastProgress {...view.progress} />}
      {view.actions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {view.actions.map((action) => (
            <Button
              key={action.id}
              size="sm"
              variant={action.primary ? "primary" : "secondary"}
              isPending={action.isPending}
              onPress={() => onAction(action.id)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The visible count is aria-hidden: the toast is an atomic live region and
 *  would re-announce every poll. The bar carries the value instead. */
function ToastProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-3">
      <ProgressBar
        aria-label="Progreso de la descarga"
        size="sm"
        value={current}
        maxValue={total}
        valueLabel={`${formatNumber(current)} de ${plural(total, "episodio", "episodios")}`}
        className="flex-1"
      >
        <ProgressBar.Track>
          <ProgressBar.Fill />
        </ProgressBar.Track>
      </ProgressBar>
      <span aria-hidden="true" className="shrink-0 text-xs tabular-nums">
        {formatProgress(current, total)}
      </span>
    </div>
  );
}
