"use client";

import {
  Button,
  Checkbox,
  Drawer,
  InputGroup,
  Label,
  ProgressBar,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  toast,
  useOverlayState,
} from "@heroui/react";
import { RefreshCw, Send, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiResponseError, ApiTimeoutError, apiFetch } from "@/lib/api/client";
import {
  connectMyJd,
  disconnectMyJd,
  isMyJdConnected,
  listMyJdDevices,
  providerLabels,
  sendToClickNLoad,
  sendToMyJd,
} from "./download-client";
import {
  getDeviceProfile,
  isPortableDevice,
  type DeviceProfile,
} from "./device-profile";
import {
  isRememberedDeviceAvailable,
  planDownloadDispatch,
} from "./download-policy";
import {
  loadActiveDownloadJobs,
  saveActiveDownloadJobs,
  type PersistedDownloadJob,
} from "./download-job-storage";
import type {
  DownloadActivityStatus,
  DownloadPreferences,
  DownloadProviderId,
  DownloadRequest,
} from "./download-types";

interface ResolvedEpisode {
  episodeNumber: number;
  audio: "SUB" | "DUB";
  links: Array<{ provider: DownloadProviderId; url: string }>;
  errorCode: string | null;
}

interface SavedJob {
  jobId: string;
  accessToken: string;
  expiresAt: string;
}

interface Activity {
  id: string;
  request: DownloadRequest;
  status: DownloadActivityStatus;
  label: string;
  detail: string;
  current: number;
  total: number;
  packageName: string;
  episodes: ResolvedEpisode[];
  receipt?: SavedJob;
  destination: DownloadPreferences["destination"];
  createdAt: number;
  deliveryAttempted?: boolean;
}

interface MyJdDevice {
  id: string;
  name: string;
}

interface DownloadContextValue {
  openDownload: (request: DownloadRequest) => void;
  getEpisodeStatus: (
    slug: string,
    episodeNumber: number,
  ) => DownloadActivityStatus | undefined;
  openSettings: () => void;
  preferences: DownloadPreferences;
  deviceProfile: DeviceProfile;
}

const defaults: DownloadPreferences = {
  audio: "SUB",
  providers: ["MEGA", "PIXELDRAIN", "MP4UPLOAD"],
  destination: "CNL",
};
const storageKey = "animehub.download-preferences";
const selectedDeviceStorageKey = "animehub.myjd.device";
const DownloadContext = createContext<DownloadContextValue | null>(null);

function requiresBackgroundJob(request: DownloadRequest, total: number) {
  return (
    request.all ||
    (!request.episodeNumbers &&
      request.from !== undefined &&
      request.to !== undefined) ||
    total > 50
  );
}

const resumableStatuses = new Set<DownloadActivityStatus>([
  "processing",
  "ready",
  "waiting-device",
  "sending",
]);

function isResumableActivity(activity: Activity) {
  return Boolean(activity.receipt && resumableStatuses.has(activity.status));
}

function getBrowserStorage(name: "localStorage" | "sessionStorage") {
  if (typeof window === "undefined") return null;
  try {
    return window[name];
  } catch {
    return null;
  }
}

function readBrowserStorage(
  name: "localStorage" | "sessionStorage",
  key: string,
) {
  try {
    return getBrowserStorage(name)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeBrowserStorage(
  name: "localStorage" | "sessionStorage",
  key: string,
  value: string | null,
) {
  try {
    const storage = getBrowserStorage(name);
    if (!storage) return;
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // Storage is best effort; the live provider remains usable without it.
  }
}

function persistedJobFromActivity(
  activity: Activity,
): PersistedDownloadJob | null {
  if (!isResumableActivity(activity) || !activity.receipt) return null;
  return {
    id: activity.id,
    request: activity.request,
    receipt: activity.receipt,
    destination: activity.destination,
    createdAt: activity.createdAt,
    current: activity.current,
    total: activity.total,
    deliveryAttempted: activity.deliveryAttempted === true,
  };
}

export function useDownloads() {
  const value = useContext(DownloadContext);
  if (!value) throw new Error("DownloadProvider is missing.");
  return value;
}

export function DownloadProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(defaults);
  const preferencesRef = useRef(defaults);
  const [mode, setMode] = useState<"settings" | "devices">("settings");
  const [activities, setActivities] = useState<Activity[]>([]);
  const activitiesRef = useRef<Activity[]>([]);
  const [dismissedResumableIds, setDismissedResumableIds] = useState<
    Set<string>
  >(() => new Set());
  const dismissedResumableIdsRef = useRef(new Set<string>());
  const setActivityDismissed = useCallback(
    (activityId: string, dismissed: boolean) => {
      const next = new Set(dismissedResumableIdsRef.current);
      if (dismissed) next.add(activityId);
      else next.delete(activityId);
      dismissedResumableIdsRef.current = next;
      setDismissedResumableIds(next);
    },
    [],
  );
  const toastIds = useRef(new Map<string, string>());
  const deliveryActionRef = useRef<(activityId: string) => void>(() => {});
  const publishActivityRef = useRef<(activity: Activity) => void>(() => {});
  const pollJobRef = useRef<
    (
      id: string,
      receipt: SavedJob,
      destination: DownloadPreferences["destination"],
      preferredDeviceId?: string,
      deferDelivery?: boolean,
      deliveryMayHaveSucceeded?: boolean,
    ) => Promise<void>
  >(async () => {});
  const pollSessionsRef = useRef(new Map<string, symbol>());
  const pollTimeoutsRef = useRef(new Map<string, number>());
  const deliverySessionsRef = useRef(new Set<string>());
  const mountedRef = useRef(false);
  const [devices, setDevices] = useState<MyJdDevice[]>([]);
  const [deviceActivityId, setDeviceActivityId] = useState<string | null>(null);
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfile>("unknown");
  const deviceProfileRef = useRef<DeviceProfile>("unknown");
  const [pendingRequest, setPendingRequest] = useState<DownloadRequest | null>(
    null,
  );
  const pendingRequestRef = useRef<DownloadRequest | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const selectedDeviceIdRef = useRef<string | null>(null);
  const [myJdConnected, setMyJdConnected] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const drawer = useOverlayState({
    onOpenChange: (isOpen) => {
      if (isOpen || deviceProfileRef.current !== "portable") return;
      const waitingActivity = activitiesRef.current.find(
        (activity) =>
          activity.id === deviceActivityId &&
          activity.status === "waiting-device",
      );
      if (waitingActivity) setActivityDismissed(waitingActivity.id, true);
      pendingRequestRef.current = null;
      setPendingRequest(null);
      setDeviceActivityId(null);
      setDeviceError(null);
    },
  });

  const replaceActivities = useCallback((next: Activity[]) => {
    if (!mountedRef.current) return;
    activitiesRef.current = next;
    setActivities(next);
    const storage = getBrowserStorage("sessionStorage");
    if (storage) {
      saveActiveDownloadJobs(
        storage,
        next
          .map(persistedJobFromActivity)
          .filter((job): job is PersistedDownloadJob => job !== null),
      );
    }
  }, []);

  const stopPolling = useCallback((id: string) => {
    pollSessionsRef.current.delete(id);
    const timeout = pollTimeoutsRef.current.get(id);
    if (timeout !== undefined) window.clearTimeout(timeout);
    pollTimeoutsRef.current.delete(id);
  }, []);

  useLayoutEffect(() => {
    const pollSessions = pollSessionsRef.current;
    const deliverySessions = deliverySessionsRef.current;
    const activeToastIds = toastIds.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const id of [...pollSessions.keys()]) stopPolling(id);
      deliverySessions.clear();
      const visibleToasts = [...activeToastIds.values()];
      activeToastIds.clear();
      visibleToasts.forEach((toastId) => toast.close(toastId));
    };
  }, [stopPolling]);

  const removeActivity = useCallback(
    (id: string) => {
      stopPolling(id);
      setActivityDismissed(id, false);
      replaceActivities(
        activitiesRef.current.filter((activity) => activity.id !== id),
      );
      toastIds.current.delete(id);
    },
    [replaceActivities, setActivityDismissed, stopPolling],
  );

  const publishActivity = useCallback(
    (activity: Activity) => {
      if (!mountedRef.current) return;
      const isQuietlyRunning = ["processing", "sending"].includes(
        activity.status,
      );
      if (isQuietlyRunning && dismissedResumableIdsRef.current.has(activity.id))
        return;
      const previous = toastIds.current.get(activity.id);
      if (previous) {
        toastIds.current.delete(activity.id);
        toast.close(previous);
      }
      setActivityDismissed(activity.id, false);
      const active = ["resolving", "processing", "sending"].includes(
        activity.status,
      );
      const description = (
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-sm text-muted">{activity.detail}</span>
          {activity.total > 0 && active && (
            <ProgressBar
              aria-label={`Progreso: ${activity.current} de ${activity.total}`}
              value={activity.current}
              maxValue={activity.total}
              color="accent"
            >
              <ProgressBar.Track>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
          )}
          {activity.status === "ready" && (
            <Button
              variant="secondary"
              className="min-h-10 self-start rounded-lg px-4 font-semibold"
              onPress={() => deliveryActionRef.current(activity.id)}
            >
              <Send size={15} />
              {activity.deliveryAttempted
                ? "Reintentar entrega"
                : "Entregar ahora"}
            </Button>
          )}
        </div>
      );
      let toastId = "";
      const options = {
        description,
        isLoading: active,
        timeout:
          active ||
          activity.status === "ready" ||
          (activity.status === "error" &&
            deviceProfileRef.current !== "portable")
            ? 0
            : activity.status === "error"
              ? 8_000
              : 6_000,
        onClose: () => {
          if (toastIds.current.get(activity.id) !== toastId) return;
          toastIds.current.delete(activity.id);
          if (isResumableActivity(activity)) {
            setActivityDismissed(activity.id, true);
            return;
          }
          if (!active) removeActivity(activity.id);
        },
      };
      toastId =
        activity.status === "error"
          ? toast.danger(activity.label, options)
          : activity.status === "partial"
            ? toast.warning(activity.label, options)
            : activity.status === "handed-off" || activity.status === "success"
              ? toast.success(activity.label, options)
              : activity.status === "cancelled"
                ? toast.warning(activity.label, options)
                : toast.info(activity.label, options);
      toastIds.current.set(activity.id, toastId);
    },
    [removeActivity, setActivityDismissed],
  );

  const addActivity = useCallback(
    (activity: Activity) => {
      if (!mountedRef.current) return;
      replaceActivities([activity, ...activitiesRef.current]);
      // A background job has no button-local pending state and must remain
      // visible even when the requested range is small.
      if (requiresBackgroundJob(activity.request, activity.total)) {
        publishActivity(activity);
      }
    },
    [publishActivity, replaceActivities],
  );

  const updateActivity = useCallback(
    (id: string, changes: Partial<Activity>) => {
      if (!mountedRef.current) return;
      const existing = activitiesRef.current.find(
        (activity) => activity.id === id,
      );
      if (!existing) return;
      const updated = { ...existing, ...changes };
      replaceActivities(
        activitiesRef.current.map((activity) =>
          activity.id === id ? updated : activity,
        ),
      );
      const active = ["resolving", "processing", "sending"].includes(
        updated.status,
      );
      const quickOperation = !requiresBackgroundJob(
        updated.request,
        updated.total,
      );
      // Quick operations communicate pending state in the download button;
      // the toast appears only for their terminal result. This prevents a
      // transient loading toast from racing a near-instant success/error.
      if (
        updated.status === "waiting-device" &&
        deviceProfileRef.current === "portable"
      )
        return;
      if (!active || !quickOperation) publishActivity(updated);
    },
    [publishActivity, replaceActivities],
  );

  useLayoutEffect(() => {
    let active = true;
    const profile = getDeviceProfile();
    deviceProfileRef.current = profile;
    document.documentElement.dataset.device = profile;

    const storedDeviceId = readBrowserStorage(
      "sessionStorage",
      selectedDeviceStorageKey,
    );
    selectedDeviceIdRef.current = storedDeviceId;
    queueMicrotask(() => {
      if (!active) return;
      setDeviceProfile(profile);
      setSelectedDeviceId(storedDeviceId);
      setMyJdConnected(isMyJdConnected());
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const storage = getBrowserStorage("localStorage");
      if (!storage) return;
      let stored: string | null = null;
      try {
        stored = storage.getItem(storageKey);
      } catch {
        return;
      }
      if (stored) {
        try {
          const legacy = JSON.parse(stored) as Partial<DownloadPreferences> & {
            quickSend?: boolean;
            confirmSingleEpisode?: boolean;
          };
          const next: DownloadPreferences = {
            audio: legacy.audio ?? defaults.audio,
            providers: legacy.providers?.length
              ? legacy.providers
              : defaults.providers,
            destination: legacy.destination ?? defaults.destination,
          };
          preferencesRef.current = next;
          setPreferences(next);
          writeBrowserStorage("localStorage", storageKey, JSON.stringify(next));
        } catch {
          writeBrowserStorage("localStorage", storageKey, null);
        }
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const savePreferences = useCallback((next: DownloadPreferences) => {
    preferencesRef.current = next;
    setPreferences(next);
    writeBrowserStorage("localStorage", storageKey, JSON.stringify(next));
  }, []);

  const rememberDevice = useCallback((deviceId: string | null) => {
    selectedDeviceIdRef.current = deviceId;
    setSelectedDeviceId(deviceId);
    writeBrowserStorage("sessionStorage", selectedDeviceStorageKey, deviceId);
  }, []);

  const refreshDevices = useCallback(async (preserveError = false) => {
    if (!isMyJdConnected()) {
      setMyJdConnected(false);
      setDevices([]);
      return [] as MyJdDevice[];
    }
    setDevicesLoading(true);
    if (!preserveError) setDeviceError(null);
    try {
      const available = await listMyJdDevices();
      const next = available.map(({ id, name }) => ({ id, name }));
      setDevices(next);
      setMyJdConnected(true);
      return next;
    } catch (error) {
      await disconnectMyJd().catch(() => undefined);
      setMyJdConnected(false);
      setDevices([]);
      setDeviceError(
        error instanceof Error
          ? error.message
          : "No se pudieron consultar los dispositivos.",
      );
      return [] as MyJdDevice[];
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  const openPortableDevicePanel = useCallback(
    (request: DownloadRequest | null, error?: string) => {
      pendingRequestRef.current = request;
      setPendingRequest(request);
      setDeviceActivityId(null);
      setDeviceError(error ?? null);
      setMyJdConnected(isMyJdConnected());
      setMode("devices");
      drawer.open();
      if (isMyJdConnected()) void refreshDevices(Boolean(error));
    },
    [drawer, refreshDevices],
  );

  const requestDevice = useCallback(
    async (activityId: string, error?: string) => {
      await refreshDevices();
      setDeviceActivityId(activityId);
      pendingRequestRef.current = null;
      setPendingRequest(null);
      setDeviceError(error ?? null);
      setMode("devices");
      drawer.open();
      updateActivity(activityId, {
        status: "waiting-device",
        label: "Elige un dispositivo",
        detail: "Este destino necesita un dispositivo de MyJDownloader",
      });
    },
    [drawer, refreshDevices, updateActivity],
  );

  const deliver = useCallback(
    async (
      id: string,
      packageName: string,
      episodes: ResolvedEpisode[],
      destination: DownloadPreferences["destination"],
      failed = 0,
      preferredDeviceId?: string,
    ) => {
      const urls = episodes.flatMap((episode) =>
        episode.links.map((link) => link.url),
      );
      if (!urls.length) {
        updateActivity(id, {
          receipt: undefined,
          status: "error",
          label: "Sin enlaces compatibles",
          detail: "No se encontraron espejos para la selección",
          episodes,
        });
        return;
      }
      if (destination === "MYJD") {
        updateActivity(id, { packageName, episodes });
        if (!preferredDeviceId) {
          await requestDevice(id);
          return;
        }
        if (deliverySessionsRef.current.has(id)) return;
        deliverySessionsRef.current.add(id);
        updateActivity(id, {
          status: "sending",
          label: "Enviando a MyJDownloader",
          detail: "Conectando con el dispositivo",
          deliveryAttempted: true,
        });
        try {
          await sendToMyJd(preferredDeviceId, packageName, urls);
          updateActivity(id, {
            receipt: undefined,
            status: "handed-off",
            label: "Solicitud aceptada por MyJDownloader",
            detail: `${urls.length} enlaces enviados al dispositivo`,
          });
        } catch (error) {
          rememberDevice(null);
          await requestDevice(
            id,
            error instanceof Error
              ? error.message
              : "El dispositivo ya no está disponible.",
          );
        } finally {
          deliverySessionsRef.current.delete(id);
        }
        return;
      }
      if (deliverySessionsRef.current.has(id)) return;
      deliverySessionsRef.current.add(id);
      updateActivity(id, {
        status: "sending",
        label: "Enviando a JDownloader",
        detail: "Entregando los enlaces a LinkGrabber",
        packageName,
        episodes,
        deliveryAttempted: true,
      });
      try {
        await sendToClickNLoad(packageName, urls);
      } catch (error) {
        updateActivity(id, {
          status: "ready",
          label: "Entrega sin confirmar",
          detail:
            error instanceof Error
              ? `${error.message} Reintentar puede duplicar enlaces.`
              : "JDownloader no confirmó la entrega; reintentar puede duplicar enlaces.",
          episodes,
          packageName,
        });
        return;
      } finally {
        deliverySessionsRef.current.delete(id);
      }
      const failedCount = Math.max(
        failed,
        episodes.filter((episode) => episode.errorCode).length,
      );
      updateActivity(id, {
        receipt: undefined,
        status: failedCount > 0 ? "partial" : "handed-off",
        label:
          failedCount > 0
            ? "Entrega parcial"
            : "Solicitud aceptada por JDownloader",
        detail:
          failedCount > 0
            ? `${urls.length} enlaces entregados; ${failedCount} episodios requieren atención`
            : `${urls.length} enlaces añadidos a LinkGrabber`,
        episodes,
        packageName,
      });
    },
    [rememberDevice, requestDevice, updateActivity],
  );

  const pollJob = useCallback(
    async function startPolling(
      id: string,
      receipt: SavedJob,
      destination: DownloadPreferences["destination"],
      preferredDeviceId?: string,
      deferDelivery = false,
      deliveryMayHaveSucceeded = false,
    ) {
      stopPolling(id);
      const session = Symbol(receipt.jobId);
      pollSessionsRef.current.set(id, session);

      const isCurrentSession = () =>
        pollSessionsRef.current.get(id) === session;
      const scheduleNextPoll = (delay: number) => {
        if (!isCurrentSession()) return;
        const timeout = window.setTimeout(() => {
          pollTimeoutsRef.current.delete(id);
          void poll();
        }, delay);
        pollTimeoutsRef.current.set(id, timeout);
      };

      async function poll() {
        if (!isCurrentSession()) return;
        if (Date.parse(receipt.expiresAt) <= Date.now()) {
          stopPolling(id);
          updateActivity(id, {
            receipt: undefined,
            status: "error",
            label: "La descarga expiró",
            detail: "Inicia la descarga de nuevo para obtener enlaces actuales",
          });
          return;
        }
        try {
          const response = await apiFetch<{
            data: {
              status: string;
              packageName: string;
              completedItems: number;
              failedItems: number;
              totalItems: number;
              episodes: ResolvedEpisode[];
            };
          }>(
            `/download-jobs/${receipt.jobId}`,
            { headers: { authorization: `Bearer ${receipt.accessToken}` } },
            true,
          );
          if (!isCurrentSession()) return;
          const job = response.data;
          const processed = job.completedItems + job.failedItems;
          updateActivity(id, {
            status: "processing",
            label: "Resolviendo episodios",
            detail: `${processed} de ${job.totalItems} procesados`,
            current: processed,
            total: job.totalItems,
            episodes: job.episodes,
            packageName: job.packageName,
          });
          if (
            ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"].includes(job.status)
          ) {
            stopPolling(id);
            if (job.status === "CANCELLED") {
              updateActivity(id, {
                receipt: undefined,
                status: "cancelled",
                label: "Trabajo cancelado",
                detail: "La operación se detuvo",
              });
              return;
            }
            const availableLinks = job.episodes.reduce(
              (total, episode) => total + episode.links.length,
              0,
            );
            if (deferDelivery && availableLinks > 0) {
              updateActivity(id, {
                status: "ready",
                label: deliveryMayHaveSucceeded
                  ? "Entrega sin confirmar"
                  : "Listo para entregar",
                detail: deliveryMayHaveSucceeded
                  ? "La pestaña se recargó durante el envío; reintentar puede duplicar enlaces"
                  : destination === "MYJD"
                    ? "Conecta o elige un dispositivo para enviar los enlaces"
                    : "Confirma para enviar los enlaces a JDownloader",
                current: processed,
                total: job.totalItems,
                episodes: job.episodes,
                packageName: job.packageName,
                deliveryAttempted: deliveryMayHaveSucceeded,
              });
              return;
            }
            await deliver(
              id,
              job.packageName,
              job.episodes,
              destination,
              job.failedItems,
              preferredDeviceId,
            );
            return;
          }
          scheduleNextPoll(1_250);
        } catch (error) {
          if (!isCurrentSession()) return;
          const capabilityRejected =
            error instanceof ApiResponseError &&
            (error.status === 401 || error.status === 404);
          if (
            capabilityRejected ||
            Date.parse(receipt.expiresAt) <= Date.now()
          ) {
            stopPolling(id);
            updateActivity(id, {
              receipt: undefined,
              status: "error",
              label: "La descarga ya no está disponible",
              detail:
                "La autorización expiró. Inicia la descarga de nuevo para continuar.",
            });
            return;
          }
          updateActivity(id, {
            status: "processing",
            label: "Reconectando con la descarga",
            detail: "Conservamos el trabajo y volveremos a intentarlo",
          });
          scheduleNextPoll(3_000);
        }
      }

      await poll();
    },
    [deliver, stopPolling, updateActivity],
  );

  useLayoutEffect(() => {
    publishActivityRef.current = publishActivity;
    pollJobRef.current = pollJob;
  }, [pollJob, publishActivity]);

  useEffect(() => {
    let active = true;
    const storage = getBrowserStorage("sessionStorage");
    const restoredJobs = storage ? loadActiveDownloadJobs(storage) : [];
    if (restoredJobs.length === 0) return;
    const restoredActivities = restoredJobs.map((job): Activity => ({
      id: job.id,
      request: job.request,
      status: "processing",
      label: "Reanudando descarga",
      detail: job.request.title,
      current: job.current,
      total: job.total,
      packageName: job.request.title,
      episodes: [],
      receipt: job.receipt,
      destination: job.destination,
      createdAt: job.createdAt,
      deliveryAttempted: job.deliveryAttempted,
    }));
    const restoredIds = new Set(
      restoredActivities.map((activity) => activity.id),
    );
    queueMicrotask(() => {
      if (!active) return;
      replaceActivities([
        ...restoredActivities,
        ...activitiesRef.current.filter(
          (activity) => !restoredIds.has(activity.id),
        ),
      ]);
      for (const activity of restoredActivities) {
        publishActivityRef.current(activity);
        void pollJobRef.current(
          activity.id,
          activity.receipt as SavedJob,
          activity.destination,
          undefined,
          true,
          activity.deliveryAttempted === true,
        );
      }
    });
    return () => {
      active = false;
      for (const activity of restoredActivities) stopPolling(activity.id);
    };
  }, [replaceActivities, stopPolling]);

  const deliverReadyActivity = useCallback(
    (activityId: string) => {
      const activity = activitiesRef.current.find(
        (entry) => entry.id === activityId && entry.status === "ready",
      );
      if (!activity) return;
      if (activity.destination === "MYJD") {
        const deviceId = selectedDeviceIdRef.current;
        if (!isMyJdConnected() || !deviceId) {
          void requestDevice(activity.id);
          return;
        }
        void deliver(
          activity.id,
          activity.packageName,
          activity.episodes,
          activity.destination,
          0,
          deviceId,
        );
        return;
      }
      void deliver(
        activity.id,
        activity.packageName,
        activity.episodes,
        activity.destination,
      );
    },
    [deliver, requestDevice],
  );
  useEffect(() => {
    deliveryActionRef.current = deliverReadyActivity;
    return () => {
      deliveryActionRef.current = () => {};
    };
  }, [deliverReadyActivity]);

  const reopenDismissedActivity = useCallback(
    (activityId: string) => {
      const activity = activitiesRef.current.find(
        (entry) => entry.id === activityId && isResumableActivity(entry),
      );
      if (!activity) return;
      setActivityDismissed(activity.id, false);
      if (activity.status === "waiting-device") {
        void requestDevice(activity.id);
        return;
      }
      publishActivity(activity);
    },
    [publishActivity, requestDevice, setActivityDismissed],
  );

  const startOperation = useCallback(
    async (
      next: DownloadRequest,
      options?: {
        destination?: DownloadPreferences["destination"];
        preferredDeviceId?: string;
      },
    ) => {
      const snapshot = preferencesRef.current;
      const destination = options?.destination ?? snapshot.destination;
      const id = crypto.randomUUID();
      const count =
        next.episodeNumbers?.length ??
        (next.from !== undefined && next.to !== undefined
          ? next.to - next.from + 1
          : 0);
      addActivity({
        id,
        request: next,
        status: "resolving",
        label:
          next.all || count > 50 ? "Preparando trabajo" : "Resolviendo espejos",
        detail: next.title,
        current: 0,
        total: count,
        packageName: next.title,
        episodes: [],
        destination,
        createdAt: Date.now(),
      });
      try {
        const requiresJob = requiresBackgroundJob(next, count);
        if (requiresJob) {
          const response = await apiFetch<{
            data: { jobId: string; accessToken: string; expiresAt: string };
          }>(
            `/anime/${encodeURIComponent(next.slug)}/download-jobs`,
            {
              method: "POST",
              signal: AbortSignal.timeout(25_000),
              body: JSON.stringify({
                scope: next.all ? "ALL" : "RANGE",
                from: next.from,
                to: next.to,
                audio: snapshot.audio,
                providers: snapshot.providers,
              }),
            },
            true,
          );
          const receipt = response.data;
          updateActivity(id, {
            receipt,
            status: "processing",
            label: "Resolviendo episodios",
            detail: `0 de ${count || "todos"} procesados`,
          });
          void pollJob(id, receipt, destination, options?.preferredDeviceId);
          return;
        }
        const response = await apiFetch<{
          data: { packageName: string; episodes: ResolvedEpisode[] };
        }>(
          `/anime/${encodeURIComponent(next.slug)}/downloads/resolve`,
          {
            method: "POST",
            signal: AbortSignal.timeout(25_000),
            body: JSON.stringify({
              episodeNumbers: next.episodeNumbers,
              audio: snapshot.audio,
              providers: snapshot.providers,
            }),
          },
          true,
        );
        await deliver(
          id,
          response.data.packageName,
          response.data.episodes,
          destination,
          0,
          options?.preferredDeviceId,
        );
      } catch (error) {
        updateActivity(id, {
          status: "error",
          label:
            error instanceof ApiTimeoutError
              ? "La fuente tardó demasiado"
              : "No se pudo preparar la descarga",
          detail:
            error instanceof ApiTimeoutError
              ? "AnimeAV1 no respondió en 25 segundos. No se envió nada a JDownloader."
              : error instanceof Error
                ? error.message
                : "Error inesperado",
        });
      }
    },
    [addActivity, deliver, pollJob, updateActivity],
  );

  const preparePortableDownload = useCallback(
    async (next: DownloadRequest) => {
      const deviceId = selectedDeviceIdRef.current;
      if (!isMyJdConnected() || !deviceId) {
        openPortableDevicePanel(next);
        return;
      }
      setDevicesLoading(true);
      try {
        const available = await listMyJdDevices();
        const normalized = available.map(({ id, name }) => ({ id, name }));
        setDevices(normalized);
        if (
          !isRememberedDeviceAvailable(
            deviceId,
            normalized.map((device) => device.id),
          )
        ) {
          rememberDevice(null);
          openPortableDevicePanel(
            next,
            "El dispositivo guardado ya no está disponible. Elige otro.",
          );
          return;
        }
        void startOperation(next, {
          destination: "MYJD",
          preferredDeviceId: deviceId,
        });
      } catch (error) {
        await disconnectMyJd().catch(() => undefined);
        setMyJdConnected(false);
        openPortableDevicePanel(
          next,
          error instanceof Error
            ? error.message
            : "Vuelve a conectar MyJDownloader.",
        );
      } finally {
        setDevicesLoading(false);
      }
    },
    [openPortableDevicePanel, rememberDevice, startOperation],
  );

  const openDownload = useCallback(
    (next: DownloadRequest) => {
      const profile = getDeviceProfile();
      deviceProfileRef.current = profile;
      setDeviceProfile(profile);
      document.documentElement.dataset.device = profile;
      const dispatch = planDownloadDispatch({
        profile,
        storedDestination: preferencesRef.current.destination,
        myJdConnected: isMyJdConnected(),
        selectedDeviceId: selectedDeviceIdRef.current,
      });
      if (profile === "portable") {
        if (dispatch.action === "configure-myjd") {
          openPortableDevicePanel(next);
        } else {
          void preparePortableDownload(next);
        }
        return;
      }
      if (dispatch.action === "start")
        void startOperation(next, { destination: dispatch.destination });
    },
    [openPortableDevicePanel, preparePortableDownload, startOperation],
  );
  const openSettings = useCallback(() => {
    setMode("settings");
    drawer.open();
  }, [drawer]);

  const openDeviceSettings = useCallback(() => {
    pendingRequestRef.current = null;
    setPendingRequest(null);
    setDeviceActivityId(null);
    setDeviceError(null);
    setMyJdConnected(isMyJdConnected());
    setMode("devices");
    drawer.open();
    if (isMyJdConnected()) void refreshDevices();
  }, [drawer, refreshDevices]);

  function toggleProvider(provider: DownloadProviderId) {
    const current = preferencesRef.current;
    const providers = current.providers.includes(provider)
      ? current.providers.filter((entry) => entry !== provider)
      : [...current.providers, provider];
    if (!providers.length) {
      toast.warning("Mantén al menos un proveedor", {
        description: "Necesitas al menos uno para resolver los enlaces.",
        timeout: 4_000,
      });
      return;
    }
    savePreferences({ ...current, providers });
  }

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    setDeviceError(null);
    try {
      const available = await connectMyJd(email, password);
      setPassword("");
      setMyJdConnected(true);
      setDevices(available.map(({ id, name }) => ({ id, name })));
    } catch (error) {
      setPassword("");
      await disconnectMyJd().catch(() => undefined);
      setMyJdConnected(false);
      if (deviceProfileRef.current === "portable" || isPortableDevice()) {
        setDeviceError(
          error instanceof Error ? error.message : "Revisa las credenciales.",
        );
        return;
      }
      toast.danger("No se pudo conectar con MyJDownloader", {
        description:
          error instanceof Error ? error.message : "Revisa las credenciales.",
      });
    }
  }

  async function sendDevice(deviceId: string) {
    const portable =
      deviceProfileRef.current === "portable" || isPortableDevice();
    const stagedRequest = pendingRequestRef.current;
    const activity = activitiesRef.current.find(
      (entry) => entry.id === deviceActivityId,
    );
    if (
      activity &&
      activity.status !== "waiting-device" &&
      activity.status !== "ready"
    )
      return;
    if (portable) {
      rememberDevice(deviceId);
      pendingRequestRef.current = null;
      setPendingRequest(null);
      setDeviceError(null);
      drawer.close();
      if (stagedRequest) {
        void startOperation(stagedRequest, {
          destination: "MYJD",
          preferredDeviceId: deviceId,
        });
        return;
      }
      if (!activity) return;
    } else if (!activity) return;

    if (deliverySessionsRef.current.has(activity.id)) return;
    deliverySessionsRef.current.add(activity.id);
    const urls = activity.episodes.flatMap((episode) =>
      episode.links.map((link) => link.url),
    );
    updateActivity(activity.id, {
      status: "sending",
      label: "Enviando a MyJDownloader",
      detail: "Conectando con el dispositivo",
      deliveryAttempted: true,
    });
    drawer.close();
    try {
      await sendToMyJd(deviceId, activity.packageName, urls);
      updateActivity(activity.id, {
        receipt: undefined,
        status: "handed-off",
        label: "Solicitud aceptada por MyJDownloader",
        detail: `${urls.length} enlaces enviados al dispositivo`,
      });
    } catch (error) {
      if (portable) rememberDevice(null);
      await requestDevice(
        activity.id,
        error instanceof Error
          ? error.message
          : "El dispositivo ya no está disponible.",
      );
    } finally {
      deliverySessionsRef.current.delete(activity.id);
    }
  }

  async function resetMyJdConnection() {
    try {
      await disconnectMyJd();
    } finally {
      setMyJdConnected(false);
      setDevices([]);
      setDeviceError(null);
      rememberDevice(null);
    }
  }

  const getEpisodeStatus = useCallback(
    (slug: string, episodeNumber: number) =>
      activities.find(
        (activity) =>
          activity.request.slug === slug &&
          activity.request.episodeNumbers?.length === 1 &&
          activity.request.episodeNumbers[0] === episodeNumber,
      )?.status,
    [activities],
  );
  const dismissedResumable = activities.filter(
    (activity) =>
      dismissedResumableIds.has(activity.id) && isResumableActivity(activity),
  );
  const deviceDeliveryPending = activities.some(
    (activity) =>
      activity.id === deviceActivityId && activity.status === "sending",
  );

  return (
    <DownloadContext.Provider
      value={{
        openDownload,
        getEpisodeStatus,
        openSettings,
        preferences,
        deviceProfile,
      }}
    >
      {children}
      {dismissedResumable.length > 0 && (
        <Button
          className="fixed bottom-6 right-6 z-50 min-h-11 rounded-xl bg-[#16243A] px-4 text-sm font-semibold text-[#E6F0FF] shadow-[0_16px_40px_rgb(0_0_0/0.34)] max-sm:bottom-24 max-sm:right-4"
          onPress={() => reopenDismissedActivity(dismissedResumable[0].id)}
          aria-label={
            dismissedResumable.length === 1
              ? "Abrir descarga pendiente"
              : `Abrir ${dismissedResumable.length} descargas pendientes`
          }
        >
          <Send size={16} aria-hidden="true" />
          {dismissedResumable.length === 1
            ? dismissedResumable[0].status === "processing"
              ? "Descarga en curso"
              : dismissedResumable[0].status === "sending"
                ? "Entrega en curso"
                : "Descarga pendiente"
            : `${dismissedResumable.length} descargas pendientes`}
        </Button>
      )}
      <Drawer state={drawer}>
        <Drawer.Trigger className="drawer-state-trigger" aria-hidden="true">
          Abrir descargas
        </Drawer.Trigger>
        <Drawer.Backdrop
          variant="blur"
          className="download-drawer-backdrop z-[60]"
        >
          <Drawer.Content
            placement="right"
            className="download-drawer-content z-[70]"
          >
            <Drawer.Dialog
              className="download-drawer-dialog !w-full !max-w-md border-l border-white/10 bg-[#07101A] text-[#F3F8FC]"
              aria-label="Descargas"
            >
              <Drawer.Header className="mobile-drawer-header flex items-center justify-between border-b border-white/8 px-5 py-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#2F81F7]">
                    Descargas
                  </span>
                  <h2>
                    {mode === "settings"
                      ? "Preferencias"
                      : deviceProfile === "portable" && !pendingRequest
                        ? "MyJDownloader"
                        : "Elegir dispositivo"}
                  </h2>
                </div>
                <Drawer.CloseTrigger
                  className="grid size-10 place-items-center rounded-lg text-[#8FA3B4] hover:bg-[#102130]"
                  aria-label="Cerrar"
                >
                  <X size={18} />
                </Drawer.CloseTrigger>
              </Drawer.Header>
              <Drawer.Body className="mobile-drawer-body px-5 py-5">
                {mode === "settings" ? (
                  <PreferencesPanel
                    preferences={preferences}
                    savePreferences={savePreferences}
                    toggleProvider={toggleProvider}
                    portable={deviceProfile === "portable"}
                    selectedDeviceName={
                      devices.find((device) => device.id === selectedDeviceId)
                        ?.name ??
                      (selectedDeviceId ? "Dispositivo recordado" : null)
                    }
                    openDeviceSettings={openDeviceSettings}
                  />
                ) : deviceProfile === "portable" ? (
                  <div className="flex flex-col gap-4">
                    {deviceError && (
                      <div
                        className="rounded-xl border border-[#FB7185]/25 bg-[#FB7185]/8 px-4 py-3 text-sm text-[#FCA5B4]"
                        role="alert"
                      >
                        {deviceError}
                      </div>
                    )}
                    {myJdConnected ? (
                      <>
                        {devicesLoading ? (
                          <div
                            className="flex min-h-24 items-center justify-center gap-2 text-sm text-[#8FA3B4]"
                            role="status"
                          >
                            <RefreshCw className="size-4 animate-spin" />
                            Buscando dispositivos
                          </div>
                        ) : devices.length > 0 ? (
                          <>
                            <p className="text-sm text-[#8FA3B4]">
                              {pendingRequest
                                ? "Elige dónde enviar esta descarga."
                                : "El dispositivo elegido se usará durante esta sesión."}
                            </p>
                            {devices.map((device) => (
                              <Button
                                variant="secondary"
                                className="min-h-12 justify-between rounded-xl bg-[#0B1621] text-[#F3F8FC]"
                                key={device.id}
                                onPress={() => void sendDevice(device.id)}
                                isDisabled={deviceDeliveryPending}
                              >
                                <span className="min-w-0 truncate">
                                  {device.name}
                                </span>
                                <Send size={16} />
                              </Button>
                            ))}
                          </>
                        ) : (
                          <div className="rounded-xl bg-[#0B1621] p-4">
                            <strong className="text-sm text-[#F3F8FC]">
                              No hay dispositivos disponibles
                            </strong>
                            <p className="mt-1 text-xs leading-5 text-[#8FA3B4]">
                              Abre JDownloader en el equipo de destino y vuelve
                              a buscar.
                            </p>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            className="min-h-11 rounded-xl bg-[#151E2E] text-[#F3F8FC]"
                            onPress={() => void refreshDevices()}
                          >
                            <RefreshCw size={15} /> Actualizar
                          </Button>
                          <Button
                            variant="ghost"
                            className="min-h-11 text-[#8FA3B4]"
                            onPress={() => void resetMyJdConnection()}
                          >
                            Usar otra cuenta
                          </Button>
                        </div>
                      </>
                    ) : (
                      <form className="flex flex-col gap-4" onSubmit={connect}>
                        <p className="text-sm text-[#8FA3B4]">
                          Conecta tu cuenta para elegir el JDownloader de
                          destino. La contraseña no se guarda.
                        </p>
                        <TextField
                          type="email"
                          value={email}
                          onChange={setEmail}
                          variant="secondary"
                          isRequired
                        >
                          <Label>Correo</Label>
                          <InputGroup>
                            <InputGroup.Input autoComplete="username" />
                          </InputGroup>
                        </TextField>
                        <TextField
                          type="password"
                          value={password}
                          onChange={setPassword}
                          variant="secondary"
                          isRequired
                        >
                          <Label>Contraseña</Label>
                          <InputGroup>
                            <InputGroup.Input autoComplete="current-password" />
                          </InputGroup>
                        </TextField>
                        <Button
                          type="submit"
                          className="min-h-11 bg-[#2F81F7] text-white"
                        >
                          Conectar
                        </Button>
                      </form>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {devices.length > 0 ? (
                      <>
                        <p className="text-sm text-[#8FA3B4]">
                          El dispositivo se aplica únicamente a esta operación.
                        </p>
                        {devices.map((device) => (
                          <Button
                            variant="secondary"
                            className="justify-between rounded-xl bg-[#0B1621] text-[#F3F8FC]"
                            key={device.id}
                            onPress={() => void sendDevice(device.id)}
                            isDisabled={deviceDeliveryPending}
                          >
                            {device.name}
                            <Send size={16} />
                          </Button>
                        ))}
                      </>
                    ) : (
                      <form className="flex flex-col gap-4" onSubmit={connect}>
                        <p className="text-sm text-[#8FA3B4]">
                          La contraseña se descarta al derivar la sesión.
                        </p>
                        <TextField
                          type="email"
                          value={email}
                          onChange={setEmail}
                          variant="secondary"
                          isRequired
                        >
                          <Label>Correo</Label>
                          <InputGroup>
                            <InputGroup.Input autoComplete="username" />
                          </InputGroup>
                        </TextField>
                        <TextField
                          type="password"
                          value={password}
                          onChange={setPassword}
                          variant="secondary"
                          isRequired
                        >
                          <Label>Contraseña</Label>
                          <InputGroup>
                            <InputGroup.Input autoComplete="current-password" />
                          </InputGroup>
                        </TextField>
                        <Button
                          type="submit"
                          className="bg-[#2F81F7] text-white"
                        >
                          Conectar
                        </Button>
                      </form>
                    )}
                  </div>
                )}
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
    </DownloadContext.Provider>
  );
}

function PreferencesPanel({
  preferences,
  savePreferences,
  toggleProvider,
  portable,
  selectedDeviceName,
  openDeviceSettings,
}: {
  preferences: DownloadPreferences;
  savePreferences: (next: DownloadPreferences) => void;
  toggleProvider: (provider: DownloadProviderId) => void;
  portable: boolean;
  selectedDeviceName: string | null;
  openDeviceSettings: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <fieldset className="border-b border-white/8 pb-5">
        <legend className="mb-3 text-sm font-semibold text-[#F3F8FC]">
          Audio preferido
        </legend>
        <ToggleButtonGroup
          selectionMode="single"
          selectedKeys={new Set([preferences.audio])}
          onSelectionChange={(keys) => {
            const audio = Array.from(keys)[0] as "SUB" | "DUB" | undefined;
            if (audio) savePreferences({ ...preferences, audio });
          }}
          className="grid grid-cols-2 gap-2"
        >
          {(["SUB", "DUB"] as const).map((audio) => (
            <ToggleButton id={audio} key={audio} className="h-10 rounded-lg">
              {audio}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <p className="mt-2 text-xs text-[#8FA3B4]">
          Si no está disponible, se usará el otro audio.
        </p>
      </fieldset>
      <fieldset className="border-b border-white/8 pb-5">
        <legend className="mb-3 text-sm font-semibold text-[#F3F8FC]">
          Proveedores
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(providerLabels) as DownloadProviderId[]).map(
            (provider) => (
              <Checkbox
                key={provider}
                isSelected={preferences.providers.includes(provider)}
                onChange={() => toggleProvider(provider)}
              >
                <Checkbox.Content>
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  {providerLabels[provider]}
                </Checkbox.Content>
              </Checkbox>
            ),
          )}
        </div>
      </fieldset>
      <fieldset className="border-b border-white/8 pb-5">
        <legend className="mb-3 text-sm font-semibold text-[#F3F8FC]">
          Destino
        </legend>
        {portable ? (
          <div className="flex min-h-14 items-center gap-3 rounded-xl bg-[#0B1621] px-4 py-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#16243A] text-[#69A7FF]">
              <Send size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-sm text-[#F3F8FC]">
                MyJDownloader
              </strong>
              <span className="block truncate text-xs text-[#8FA3B4]">
                {selectedDeviceName ?? "Sin dispositivo elegido"}
              </span>
            </span>
            <Button
              variant="ghost"
              className="min-h-10 shrink-0 px-2 text-xs font-semibold text-[#69A7FF]"
              onPress={openDeviceSettings}
            >
              {selectedDeviceName ? "Cambiar" : "Configurar"}
            </Button>
          </div>
        ) : (
          <ToggleButtonGroup
            selectionMode="single"
            selectedKeys={new Set([preferences.destination])}
            onSelectionChange={(keys) => {
              const destination = Array.from(keys)[0] as
                "CNL" | "MYJD" | undefined;
              if (destination) savePreferences({ ...preferences, destination });
            }}
            className="grid grid-cols-2 gap-2"
          >
            <ToggleButton id="CNL" className="h-11 rounded-lg">
              Click&apos;n&apos;Load
            </ToggleButton>
            <ToggleButton id="MYJD" className="h-11 rounded-lg">
              MyJDownloader
            </ToggleButton>
          </ToggleButtonGroup>
        )}
      </fieldset>
    </div>
  );
}
