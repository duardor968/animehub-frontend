import { Button } from "@heroui/react";
import { plural } from "@/lib/format";
import {
  describeAudioFallback,
  describeFailed,
  describeLinks,
  describeRequest,
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
  title: string;
  variant: "default" | "accent" | "success" | "warning" | "danger";
  isLoading: boolean;
  /** Auto-dismiss delay; 0 keeps the toast until the user acts. */
  timeout: number;
  summary: string;
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

const destinationNames: Record<DownloadDestination, string> = {
  CNL: "JDownloader",
  MYJD: "MyJDownloader",
  COPY: "el portapapeles",
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

function sentSentence(activity: Activity, episodes: ResolvedEpisode[]) {
  const links = describeLinks(episodes);
  switch (activity.deliveredVia) {
    case "COPY":
      return `${links} en el portapapeles.`;
    case "MYJD":
      return `${links} enviados a MyJDownloader.`;
    default:
      return `${links} enviados a JDownloader.`;
  }
}

export function presentActivity(
  activity: Activity,
  { portable }: { portable: boolean },
): ActivityView {
  const summary = describeRequest(activity.request);
  const episodes = deliverableEpisodes(activity);
  const base = { summary, isLoading: false, actions: [] };
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
        title: activity.isJob
          ? activity.total > 1
            ? `Preparando ${plural(activity.total, "episodio", "episodios")}`
            : "Preparando la descarga"
          : "Buscando enlaces",
        variant: "accent",
        isLoading: true,
        timeout: 0,
        actions: [{ id: "cancel", label: "Cancelar" }],
      };
    case "processing":
      return {
        ...base,
        title: activity.reconnecting
          ? "Reconectando con la descarga"
          : activity.restored
            ? "Reanudando la descarga"
            : "Buscando enlaces",
        detail: activity.reconnecting
          ? "Se perdió la conexión con AnimeHub; seguimos intentándolo."
          : undefined,
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
        detail: "Elige el JDownloader de tu cuenta al que enviar los enlaces.",
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
          title: "Enlaces listos para copiar",
          detail: `${describeLinks(episodes)}. El navegador no permitió copiarlos automáticamente.`,
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
        title: "Enlaces listos",
        detail: activity.deliveryFailed
          ? `${describeLinks(episodes)}. El último envío falló; vuelve a intentarlo o cópialos.`
          : `${describeLinks(episodes)}. Confirma para enviarlos.`,
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
    case "handed-off":
    case "success": {
      const fallback = describeAudioFallback(episodes, activity.preferredAudio);
      const hint =
        activity.deliveredVia === "COPY"
          ? "Pégalos en tu gestor de descargas."
          : "Aparecerán en LinkGrabber.";
      return {
        ...base,
        title:
          activity.deliveredVia === "COPY"
            ? "Enlaces copiados"
            : `Enviado a ${destinationNames[activity.deliveredVia ?? "CNL"]}`,
        detail: [sentSentence(activity, episodes), fallback, hint]
          .filter(Boolean)
          .join(" "),
        variant: "success",
        timeout: fallback ? 9_000 : 6_000,
      };
    }
    case "partial": {
      const failed = failedEpisodeNumbers(episodes);
      const delivered = episodes.filter((episode) => episode.links.length > 0);
      return {
        ...base,
        title: "Entrega parcial",
        detail: [
          sentSentence(activity, delivered),
          describeFailed(failed, activity.failedCount),
          describeAudioFallback(delivered, activity.preferredAudio),
        ]
          .filter(Boolean)
          .join(" "),
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
          detail:
            "Ningún proveedor activo tiene este contenido. Activa más proveedores en Preferencias.",
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
        actions: activity.receipt
          ? []
          : [{ id: "retry", label: "Reintentar", primary: true }],
      };
  }
}

/** Toast body. Rendered by the toast region (outside the download context),
 *  so actions go through the callback. Uses spans only: the toast puts the
 *  description inside a <span>. */
export function ActivityToastBody({
  view,
  onAction,
}: {
  view: ActivityView;
  onAction: (action: ActivityAction) => void;
}) {
  return (
    <span className="flex min-w-0 flex-col gap-2">
      <span className="truncate text-sm font-semibold text-subtle">
        {view.summary}
      </span>
      {view.detail && (
        <span className="text-sm leading-5 text-muted">{view.detail}</span>
      )}
      {view.progress && <ToastProgress {...view.progress} />}
      {view.actions.length > 0 && (
        <span className="mt-1 flex flex-wrap gap-2">
          {view.actions.map((action) => (
            <Button
              key={action.id}
              size="sm"
              variant={action.primary ? "primary" : "secondary"}
              isPending={action.isPending}
              className={`min-h-9 rounded-lg px-3 text-xs font-semibold shadow-none outline-none focus-visible:ring-2 focus-visible:ring-focus [@media(pointer:coarse)]:min-h-11 ${action.primary ? "bg-accent text-accent-foreground hover:bg-accent-hover" : "bg-default text-foreground hover:bg-default-hover"}`}
              onPress={() => onAction(action.id)}
            >
              {action.label}
            </Button>
          ))}
        </span>
      )}
    </span>
  );
}

/** Progress made of spans (valid inside the toast's description span). The
 *  visible count is aria-hidden so the toast's live region doesn't re-announce
 *  every poll; the progressbar role carries the value for screen readers. */
function ToastProgress({ current, total }: { current: number; total: number }) {
  const ratio = total > 0 ? Math.min(1, current / total) : 0;
  return (
    <span className="flex items-center gap-3">
      <span
        role="progressbar"
        aria-label="Progreso de la descarga"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={`${current} de ${plural(total, "episodio", "episodios")}`}
        className="relative block h-1.5 flex-1 overflow-hidden rounded-full bg-default"
      >
        <span
          className="absolute inset-0 origin-left rounded-full bg-brand transition-transform duration-500 ease-out"
          style={{ transform: `scaleX(${ratio})` }}
        />
      </span>
      <span aria-hidden="true" className="text-xs tabular-nums text-muted">
        {current}/{total}
      </span>
    </span>
  );
}
