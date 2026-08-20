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
import { ApiTimeoutError, apiFetch } from "@/lib/api/client";
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
  title: string;
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
  const toastIds = useRef(new Map<string, string>());
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
      pendingRequestRef.current = null;
      setPendingRequest(null);
      setDeviceActivityId(null);
      setDeviceError(null);
    },
  });

  const replaceActivities = useCallback((next: Activity[]) => {
    activitiesRef.current = next;
    setActivities(next);
  }, []);

  const removeActivity = useCallback((id: string) => {
    const next = activitiesRef.current.filter((activity) => activity.id !== id);
    activitiesRef.current = next;
    setActivities(next);
    toastIds.current.delete(id);
  }, []);

  const publishActivity = useCallback(
    (activity: Activity) => {
      const previous = toastIds.current.get(activity.id);
      if (previous) toast.close(previous);
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
        </div>
      );
      let toastId = "";
      const options = {
        description,
        isLoading: active,
        timeout:
          active ||
          (activity.status === "error" &&
            deviceProfileRef.current !== "portable")
            ? 0
            : activity.status === "error"
              ? 8_000
              : 6_000,
        onClose: () => {
          if (toastIds.current.get(activity.id) !== toastId) return;
          toastIds.current.delete(activity.id);
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
    [removeActivity],
  );

  const addActivity = useCallback(
    (activity: Activity) => {
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
    const profile = getDeviceProfile();
    deviceProfileRef.current = profile;
    setDeviceProfile(profile);
    document.documentElement.dataset.device = profile;

    const storedDeviceId = sessionStorage.getItem(selectedDeviceStorageKey);
    selectedDeviceIdRef.current = storedDeviceId;
    setSelectedDeviceId(storedDeviceId);
    setMyJdConnected(isMyJdConnected());
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const stored = localStorage.getItem(storageKey);
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
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          localStorage.removeItem(storageKey);
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
    localStorage.setItem(storageKey, JSON.stringify(next));
  }, []);

  const rememberDevice = useCallback((deviceId: string | null) => {
    selectedDeviceIdRef.current = deviceId;
    setSelectedDeviceId(deviceId);
    if (deviceId) sessionStorage.setItem(selectedDeviceStorageKey, deviceId);
    else sessionStorage.removeItem(selectedDeviceStorageKey);
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
        updateActivity(id, {
          status: "sending",
          label: "Enviando a MyJDownloader",
          detail: "Conectando con el dispositivo",
        });
        try {
          await sendToMyJd(preferredDeviceId, packageName, urls);
          updateActivity(id, {
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
        }
        return;
      }
      updateActivity(id, {
        status: "sending",
        label: "Enviando a JDownloader",
        detail: "Entregando los enlaces a LinkGrabber",
        packageName,
        episodes,
      });
      try {
        await sendToClickNLoad(packageName, urls);
      } catch (error) {
        updateActivity(id, {
          status: "error",
          label: "JDownloader no respondió",
          detail:
            error instanceof Error
              ? error.message
              : "No se pudo contactar el servicio local de Click'n'Load.",
          episodes,
          packageName,
        });
        return;
      }
      const failedCount = Math.max(
        failed,
        episodes.filter((episode) => episode.errorCode).length,
      );
      updateActivity(id, {
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
    async function poll(
      id: string,
      receipt: SavedJob,
      destination: DownloadPreferences["destination"],
      preferredDeviceId?: string,
    ) {
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
          if (job.status === "CANCELLED") {
            updateActivity(id, {
              status: "cancelled",
              label: "Trabajo cancelado",
              detail: "La operación se detuvo",
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
        window.setTimeout(
          () => void poll(id, receipt, destination, preferredDeviceId),
          1_250,
        );
      } catch (error) {
        updateActivity(id, {
          status: "error",
          label: "No se pudo consultar el trabajo",
          detail: error instanceof Error ? error.message : "Error inesperado",
        });
      }
    },
    [deliver, updateActivity],
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
          const receipt = { ...response.data, title: next.title };
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

    const urls = activity.episodes.flatMap((episode) =>
      episode.links.map((link) => link.url),
    );
    updateActivity(activity.id, {
      status: "sending",
      label: "Enviando a MyJDownloader",
      detail: "Conectando con el dispositivo",
    });
    drawer.close();
    try {
      await sendToMyJd(deviceId, activity.packageName, urls);
      updateActivity(activity.id, {
        status: "handed-off",
        label: "Solicitud aceptada por MyJDownloader",
        detail: `${urls.length} enlaces enviados al dispositivo`,
      });
    } catch (error) {
      if (portable) {
        rememberDevice(null);
        await requestDevice(
          activity.id,
          error instanceof Error
            ? error.message
            : "El dispositivo ya no está disponible.",
        );
        return;
      }
      updateActivity(activity.id, {
        status: "error",
        label: "No se pudo enviar",
        detail: error instanceof Error ? error.message : "Error inesperado",
      });
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
