"use client";

import { Button, ProgressCircle, toast, useOverlayState } from "@heroui/react";
import { Download } from "lucide-react";
import dynamic from "next/dynamic";
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
import {
  ApiConnectionError,
  ApiResponseError,
  ApiTimeoutError,
  apiFetch,
} from "@/lib/api/client";
import type { components } from "@/lib/api/generated";
import { formatNumber, plural } from "@/lib/format";
import {
  ActivityToastBody,
  activeStatuses,
  deliverableEpisodes,
  formatProgress,
  presentActivity,
  unfinishedStatuses,
  type Activity,
  type ActivityAction,
  type ResolvedEpisode,
  type SavedJob,
} from "./download-activity";
import {
  connectMyJd,
  copyLinks,
  disconnectMyJd,
  isMyJdConnected,
  listMyJdDevices,
  sendToClickNLoad,
  sendToMyJd,
} from "./download-client";
import {
  collectUrls,
  describeLinks,
  describeRequest,
  failedEpisodeNumbers,
  requestEpisodeCount,
  requestKey,
} from "./download-copy";
import {
  ClickNLoadError,
  describeApiError,
  describeClickNLoadError,
  describeMyJdError,
} from "./download-errors";
import {
  getDeviceProfile,
  getEffectiveDestination,
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
import type { MyJdDevice } from "./download-panels";
import type {
  DownloadActivityStatus,
  DownloadDestination,
  DownloadPreferences,
  DownloadProviderId,
  DownloadRequest,
} from "./download-types";

// The drawer (preferences, MyJDownloader devices, links) and its form
// components load on demand: most page views never open it.
const loadDownloadDrawer = () => import("./download-drawer");
/** Starts fetching the drawer's code ahead of a likely open (hover/focus). */
export function preloadDownloadDrawer() {
  void loadDownloadDrawer();
}
const DownloadDrawer = dynamic(
  () => loadDownloadDrawer().then((module) => module.DownloadDrawer),
  { ssr: false },
);

/** The resolve endpoint accepts up to 50 episodes; more need a background job. */
export const MAX_QUICK_EPISODES = 50;
/** Largest explicit list a job accepts (scope EPISODES). */
export const MAX_JOB_EPISODES = 5_000;

type JobRequestBody =
  | components["schemas"]["AllDownloadJobRequestDto"]
  | components["schemas"]["RangeDownloadJobRequestDto"]
  | components["schemas"]["EpisodesDownloadJobRequestDto"];
type JobReceipt = components["schemas"]["DownloadJobReceiptDto"];
type JobData = components["schemas"]["DownloadJobDataDto"];

/** Poll less often as a job grows: every poll returns all its items. */
export function jobPollInterval(totalItems: number) {
  if (totalItems > 500) return 5_000;
  if (totalItems > 200) return 3_000;
  if (totalItems > 50) return 2_000;
  return 1_250;
}

/** The request may have reached the API (no answer, a server error or a
 *  rate limit): retrying with the same Idempotency-Key can't duplicate it. */
function outcomeUnknown(error: unknown) {
  return (
    error instanceof ApiConnectionError ||
    error instanceof TypeError ||
    (error instanceof ApiResponseError &&
      (error.status >= 500 || error.status === 429))
  );
}

/** A 4xx (other than a rate limit or a key conflict) fails the same way on
 *  every retry: the request itself is wrong. */
function retryable(error: unknown) {
  return !(
    error instanceof ApiResponseError &&
    error.status >= 400 &&
    error.status < 500 &&
    ![408, 409, 422, 429].includes(error.status)
  );
}

function postJob(
  slug: string,
  body: string,
  key: string,
  { signal, timeoutMs }: { signal?: AbortSignal; timeoutMs?: number } = {},
) {
  return apiFetch<{ data: JobReceipt }>(
    `/anime/${encodeURIComponent(slug)}/download-jobs`,
    { method: "POST", signal, headers: { "idempotency-key": key }, body },
    true,
    { timeoutMs },
  );
}

/**
 * A job POST abandoned in flight (Cancel, or the 25 s deadline) may still
 * create the job. Repeating it with the same Idempotency-Key returns that job
 * (or creates it) with a token, so it can be cancelled instead of running
 * unseen. Best effort: nothing else depends on it.
 */
async function cancelAbandonedJob(slug: string, body: string, key: string) {
  try {
    const { data } = await postJob(slug, body, key, { timeoutMs: 30_000 });
    await apiFetch(
      `/download-jobs/${data.jobId}/cancel`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${data.accessToken}` },
      },
      true,
      { timeoutMs: 15_000 },
    );
  } catch {
    // The job (if any) expires on its own.
  }
}

/** A request that can't be expressed as a bounded job. */
export class SelectionTooLargeError extends Error {
  constructor() {
    super(`Selection above ${MAX_JOB_EPISODES} episodes or unbounded range`);
    this.name = "SelectionTooLargeError";
  }
}

interface DownloadContextValue {
  openDownload: (request: DownloadRequest) => void;
  getEpisodeStatus: (
    slug: string,
    episodeNumber: number,
  ) => DownloadActivityStatus | undefined;
  /** Status of the latest activity for exactly this request, if any. */
  getRequestStatus: (
    request: DownloadRequest,
  ) => DownloadActivityStatus | undefined;
  openSettings: () => void;
  preferences: DownloadPreferences;
  deviceProfile: DeviceProfile;
  /** Fixed bottom stack where page-level bars (episode selection) portal in,
   *  so they never overlap the pending-download button. */
  dockSlot: HTMLElement | null;
}

const defaults: DownloadPreferences = {
  audio: "SUB",
  providers: ["MEGA", "PIXELDRAIN", "MP4UPLOAD"],
  destination: "CNL",
};
const storageKey = "animehub.download-preferences";
const selectedDeviceStorageKey = "animehub.myjd.device";
const DownloadContext = createContext<DownloadContextValue | null>(null);

function requiresBackgroundJob(request: DownloadRequest) {
  if (request.all) return true;
  if (request.episodeNumbers)
    return request.episodeNumbers.length > MAX_QUICK_EPISODES;
  return request.from !== undefined && request.to !== undefined;
}

/** Body for POST /download-jobs. A selection is sent as its explicit list
 *  (scope EPISODES), never as a range, and a RANGE always has both bounds. */
function jobBody(
  request: DownloadRequest,
  preferences: DownloadPreferences,
): JobRequestBody {
  const common = { audio: preferences.audio, providers: preferences.providers };
  if (request.all) return { scope: "ALL", ...common };
  if (request.episodeNumbers) {
    const episodeNumbers = [...new Set(request.episodeNumbers)];
    if (episodeNumbers.length > MAX_JOB_EPISODES)
      throw new SelectionTooLargeError();
    return { scope: "EPISODES", episodeNumbers, ...common };
  }
  if (request.from === undefined || request.to === undefined)
    throw new SelectionTooLargeError();
  return {
    scope: "RANGE",
    from: Math.min(request.from, request.to),
    to: Math.max(request.from, request.to),
    ...common,
  };
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
    deliveryFailed: activity.deliveryFailed === true,
  };
}

function isUserAbort(signal: AbortSignal | undefined) {
  return Boolean(signal?.aborted && signal.reason === "user-cancel");
}

function findIn(list: Activity[], id: string | null | undefined) {
  return id ? list.find((activity) => activity.id === id) : undefined;
}

export function useDownloads() {
  const value = useContext(DownloadContext);
  if (!value) throw new Error("DownloadProvider is missing.");
  return value;
}

type DrawerMode = "settings" | "devices" | "links";

export function DownloadProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(defaults);
  const preferencesRef = useRef(defaults);
  const [mode, setModeState] = useState<DrawerMode>("settings");
  const modeRef = useRef<DrawerMode>("settings");
  const setMode = useCallback((next: DrawerMode) => {
    modeRef.current = next;
    setModeState(next);
  }, []);
  const [activities, setActivities] = useState<Activity[]>([]);
  const activitiesRef = useRef<Activity[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const dismissedIdsRef = useRef(new Set<string>());
  const toastIds = useRef(new Map<string, string>());
  const actionRef = useRef<(id: string, action: ActivityAction) => void>(
    () => {},
  );
  const publishActivityRef = useRef<(activity: Activity) => void>(() => {});
  const pollJobRef = useRef<
    (id: string, receipt: SavedJob, deferDelivery?: boolean) => Promise<void>
  >(async () => {});
  const pollSessionsRef = useRef(new Map<string, symbol>());
  const pollTimeoutsRef = useRef(new Map<string, number>());
  const deliverySessionsRef = useRef(new Set<string>());
  const abortersRef = useRef(new Map<string, AbortController>());
  const mountedRef = useRef(false);
  const [devices, setDevices] = useState<MyJdDevice[]>([]);
  const [deviceActivityId, setDeviceActivityId] = useState<string | null>(null);
  const deviceActivityIdRef = useRef<string | null>(null);
  const [linksActivityId, setLinksActivityId] = useState<string | null>(null);
  const linksActivityIdRef = useRef<string | null>(null);
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfile>("unknown");
  const deviceProfileRef = useRef<DeviceProfile>("unknown");
  const [pendingRequest, setPendingRequest] = useState<DownloadRequest | null>(
    null,
  );
  const pendingRequestRef = useRef<DownloadRequest | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const selectedDeviceIdRef = useRef<string | null>(null);
  const [myJdConnected, setMyJdConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [dockSlot, setDockSlot] = useState<HTMLElement | null>(null);
  const drawerOpenRef = useRef(false);

  const setActivityDismissed = useCallback(
    (activityId: string, dismissed: boolean) => {
      if (dismissedIdsRef.current.has(activityId) === dismissed) return;
      const next = new Set(dismissedIdsRef.current);
      if (dismissed) next.add(activityId);
      else next.delete(activityId);
      dismissedIdsRef.current = next;
      setDismissedIds(next);
    },
    [],
  );

  const drawer = useOverlayState({
    onOpenChange: (isOpen) => {
      drawerOpenRef.current = isOpen;
      if (isOpen) return;
      // The links panel stood in for its activity's toast: bring it back.
      const linksActivity = activitiesRef.current.find(
        (activity) =>
          modeRef.current === "links" &&
          activity.id === linksActivityIdRef.current,
      );
      linksActivityIdRef.current = null;
      if (linksActivity) publishActivityRef.current(linksActivity);
      // Closing the picker leaves the job recoverable from the dock button.
      const waiting = activitiesRef.current.find(
        (activity) =>
          activity.id === deviceActivityIdRef.current &&
          activity.status === "waiting-device",
      );
      if (waiting) setActivityDismissed(waiting.id, true);
      pendingRequestRef.current = null;
      setPendingRequest(null);
      deviceActivityIdRef.current = null;
      setDeviceActivityId(null);
      setDeviceError(null);
    },
  });
  // The drawer mounts the first time it opens (fetching its code then) and
  // stays mounted, so closing still animates and reopening is instant.
  const [drawerLoaded, setDrawerLoaded] = useState(false);
  if (drawer.isOpen && !drawerLoaded) setDrawerLoaded(true);

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
    const aborters = abortersRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const id of [...pollSessions.keys()]) stopPolling(id);
      for (const controller of aborters.values()) controller.abort();
      aborters.clear();
      deliverySessions.clear();
      const visibleToasts = [...activeToastIds.values()];
      activeToastIds.clear();
      visibleToasts.forEach((toastId) => toast.close(toastId));
    };
  }, [stopPolling]);

  const closeToast = useCallback((activityId: string) => {
    const toastId = toastIds.current.get(activityId);
    if (!toastId) return;
    // Forget it first so the close callback treats this as programmatic.
    toastIds.current.delete(activityId);
    toast.close(toastId);
  }, []);

  const removeActivity = useCallback(
    (id: string) => {
      stopPolling(id);
      abortersRef.current.get(id)?.abort("user-cancel");
      abortersRef.current.delete(id);
      setActivityDismissed(id, false);
      closeToast(id);
      replaceActivities(
        activitiesRef.current.filter((activity) => activity.id !== id),
      );
    },
    [closeToast, replaceActivities, setActivityDismissed, stopPolling],
  );

  const handleToastClosed = useCallback(
    (activityId: string, toastId: string) => {
      if (toastIds.current.get(activityId) !== toastId) return;
      toastIds.current.delete(activityId);
      const activity = activitiesRef.current.find(
        (entry) => entry.id === activityId,
      );
      if (!activity) return;
      // Unfinished work stays reachable from the dock button.
      if (unfinishedStatuses.has(activity.status)) {
        setActivityDismissed(activity.id, true);
        return;
      }
      removeActivity(activity.id);
    },
    [removeActivity, setActivityDismissed],
  );

  /** Shows or updates the activity's single toast in place. */
  const publishActivity = useCallback(
    (activity: Activity) => {
      if (!mountedRef.current) return;
      const quietlyRunning = activeStatuses.has(activity.status);
      if (quietlyRunning && dismissedIdsRef.current.has(activity.id)) return;
      // While the device picker or the links panel is open, it is the UI
      // for this activity: no toast on top of (or under) the drawer.
      if (
        drawerOpenRef.current &&
        ((activity.status === "waiting-device" &&
          deviceActivityIdRef.current === activity.id) ||
          (modeRef.current === "links" &&
            linksActivityIdRef.current === activity.id))
      ) {
        closeToast(activity.id);
        return;
      }
      setActivityDismissed(activity.id, false);
      const view = presentActivity(activity, {
        portable: deviceProfileRef.current === "portable",
      });
      const existing = toastIds.current.get(activity.id);
      const holder = { id: existing ?? "" };
      const options = {
        description: (
          <ActivityToastBody
            view={view}
            onAction={(action) => actionRef.current(activity.id, action)}
          />
        ),
        variant: view.variant,
        isLoading: view.isLoading,
        timeout: view.timeout,
        onClose: () => handleToastClosed(activity.id, holder.id),
      };
      holder.id = existing
        ? toast.update(existing, view.title, options)
        : toast(view.title, options);
      toastIds.current.set(activity.id, holder.id);
    },
    [closeToast, handleToastClosed, setActivityDismissed],
  );

  const addActivity = useCallback(
    (activity: Activity) => {
      if (!mountedRef.current) return;
      replaceActivities([activity, ...activitiesRef.current]);
      publishActivity(activity);
    },
    [publishActivity, replaceActivities],
  );

  const updateActivity = useCallback(
    (id: string, changes: Partial<Activity>, publish = true) => {
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
      if (publish) publishActivity(updated);
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
      const stored = readBrowserStorage("localStorage", storageKey);
      if (!stored) return;
      try {
        const legacy = JSON.parse(stored) as Partial<DownloadPreferences> & {
          quickSend?: boolean;
          confirmSingleEpisode?: boolean;
        };
        const destination: DownloadDestination =
          legacy.destination === "MYJD" || legacy.destination === "COPY"
            ? legacy.destination
            : defaults.destination;
        const next: DownloadPreferences = {
          audio: legacy.audio === "DUB" ? "DUB" : defaults.audio,
          providers: legacy.providers?.length
            ? legacy.providers
            : defaults.providers,
          destination,
        };
        preferencesRef.current = next;
        setPreferences(next);
        writeBrowserStorage("localStorage", storageKey, JSON.stringify(next));
      } catch {
        writeBrowserStorage("localStorage", storageKey, null);
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
      setDeviceError(describeMyJdError(error));
      return [] as MyJdDevice[];
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  const showDevicePanel = useCallback(
    (
      target: { request?: DownloadRequest; activityId?: string },
      error?: string,
    ) => {
      pendingRequestRef.current = target.request ?? null;
      setPendingRequest(target.request ?? null);
      deviceActivityIdRef.current = target.activityId ?? null;
      setDeviceActivityId(target.activityId ?? null);
      setDeviceError(error ?? null);
      setMyJdConnected(isMyJdConnected());
      setMode("devices");
      drawerOpenRef.current = true;
      drawer.open();
      if (isMyJdConnected()) void refreshDevices(Boolean(error));
    },
    [drawer, refreshDevices, setMode],
  );

  const requestDevice = useCallback(
    (activityId: string, error?: string) => {
      showDevicePanel({ activityId }, error);
      updateActivity(activityId, {
        status: "waiting-device",
        destination: "MYJD",
        failure: undefined,
      });
    },
    [showDevicePanel, updateActivity],
  );

  const showLinks = useCallback(
    (activityId: string) => {
      setLinksActivityId(activityId);
      linksActivityIdRef.current = activityId;
      setMode("links");
      drawerOpenRef.current = true;
      closeToast(activityId);
      drawer.open();
    },
    [closeToast, drawer, setMode],
  );

  const deliver = useCallback(
    async (
      id: string,
      overrides: {
        destination?: DownloadDestination;
        deviceId?: string;
      } = {},
    ) => {
      const activity = findIn(activitiesRef.current, id);
      if (!activity) return;
      const destination = overrides.destination ?? activity.destination;
      const episodes = deliverableEpisodes(activity);
      const urls = collectUrls(episodes);
      if (!urls.length) {
        updateActivity(id, {
          receipt: activity.status === "partial" ? activity.receipt : undefined,
          status: "error",
          noLinks: true,
          destination,
        });
        return;
      }
      const failedNumbers = failedEpisodeNumbers(episodes);
      const failedCount = Math.max(
        failedNumbers.length,
        activity.onlyEpisodes ? 0 : (activity.failedCount ?? 0),
      );
      const finish = (via: DownloadDestination) =>
        updateActivity(id, {
          // Keep the job receipt while episodes failed so they can be retried.
          receipt: failedCount > 0 ? activity.receipt : undefined,
          status: failedCount > 0 ? "partial" : "handed-off",
          deliveredVia: via,
          destination,
          deliveryFailed: false,
          failure: undefined,
          interrupted: false,
          copyBlocked: false,
        });

      if (deliverySessionsRef.current.has(id)) return;

      if (destination === "COPY") {
        const copied = await copyLinks(urls);
        if (copied) finish("COPY");
        else
          updateActivity(id, {
            status: "ready",
            destination,
            copyBlocked: true,
            failure: undefined,
          });
        return;
      }

      if (destination === "MYJD") {
        const deviceId = overrides.deviceId ?? selectedDeviceIdRef.current;
        if (!deviceId || !isMyJdConnected()) {
          requestDevice(id);
          return;
        }
        deliverySessionsRef.current.add(id);
        updateActivity(id, {
          status: "sending",
          destination,
          deliveryAttempted: true,
          deliveryFailed: false,
          failure: undefined,
        });
        try {
          await sendToMyJd(deviceId, activity.packageName, urls);
          finish("MYJD");
        } catch (error) {
          if (deviceProfileRef.current === "portable") rememberDevice(null);
          updateActivity(
            id,
            { deliveryFailed: true, deliveryAttempted: false },
            false,
          );
          requestDevice(id, describeMyJdError(error));
        } finally {
          deliverySessionsRef.current.delete(id);
        }
        return;
      }

      deliverySessionsRef.current.add(id);
      updateActivity(id, {
        status: "sending",
        destination,
        deliveryAttempted: true,
        deliveryFailed: false,
        failure: undefined,
        interrupted: false,
      });
      try {
        await sendToClickNLoad(activity.packageName, urls);
      } catch (error) {
        const uncertain =
          error instanceof ClickNLoadError && error.maybeDelivered;
        updateActivity(id, {
          status: "ready",
          failure: describeClickNLoadError(error),
          // A refused connection proves nothing was delivered; a lost reply
          // after sending stays "attempted" so a reload warns about duplicates.
          deliveryFailed: !uncertain,
          deliveryAttempted: uncertain,
        });
        return;
      } finally {
        deliverySessionsRef.current.delete(id);
      }
      finish("CNL");
    },
    [rememberDevice, requestDevice, updateActivity],
  );

  const pollJob = useCallback(
    async function startPolling(
      id: string,
      receipt: SavedJob,
      deferDelivery = false,
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
            failure: {
              title: "La descarga caducó",
              detail: "Vuelve a iniciarla para obtener enlaces actuales.",
            },
          });
          return;
        }
        try {
          const response = await apiFetch<{
            data: Omit<JobData, "episodes"> & { episodes: ResolvedEpisode[] };
          }>(
            `/download-jobs/${receipt.jobId}`,
            { headers: { authorization: `Bearer ${receipt.accessToken}` } },
            true,
          );
          if (!isCurrentSession()) return;
          const job = response.data;
          const processed = job.completedItems + job.failedItems;
          const finished = [
            "COMPLETED",
            "PARTIAL",
            "FAILED",
            "CANCELLED",
          ].includes(job.status);
          updateActivity(
            id,
            {
              status: "processing",
              reconnecting: false,
              restored: false,
              current: processed,
              total: job.totalItems,
              episodes: job.episodes,
              packageName: job.packageName,
              failedCount: job.failedItems,
            },
            !finished,
          );
          if (!finished) {
            scheduleNextPoll(jobPollInterval(job.totalItems));
            return;
          }
          stopPolling(id);
          if (job.status === "CANCELLED") {
            updateActivity(id, {
              receipt: undefined,
              status: "cancelled",
              cancelling: false,
            });
            return;
          }
          const activity = findIn(activitiesRef.current, id);
          const deliverable = activity
            ? collectUrls(deliverableEpisodes(activity))
            : [];
          if (deferDelivery && deliverable.length > 0 && activity) {
            const interrupted =
              activity.deliveryAttempted === true &&
              activity.deliveryFailed !== true;
            updateActivity(id, {
              status: "ready",
              retrying: false,
              interrupted,
            });
            return;
          }
          updateActivity(id, { retrying: false }, false);
          await deliver(id);
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
              failure: {
                title: "La descarga ya no está disponible",
                detail:
                  "La autorización caducó. Vuelve a iniciar la descarga para continuar.",
              },
            });
            return;
          }
          const current = findIn(activitiesRef.current, id);
          const retryAfter =
            error instanceof ApiResponseError ? (error.retryAfterMs ?? 0) : 0;
          if (error instanceof ApiResponseError && error.status === 429) {
            // Rate limited: the job keeps running on the API. Wait as asked
            // and keep showing progress, not a lost connection.
            if (current?.reconnecting)
              updateActivity(id, { reconnecting: false });
            scheduleNextPoll(
              Math.max(retryAfter, jobPollInterval(current?.total ?? 0)),
            );
            return;
          }
          updateActivity(id, { status: "processing", reconnecting: true });
          scheduleNextPoll(Math.max(retryAfter, 3_000));
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
      key: requestKey(job.request),
      request: job.request,
      status: "processing",
      current: job.current,
      total: job.total,
      packageName: job.request.title,
      episodes: [],
      receipt: job.receipt,
      destination: job.destination,
      preferredAudio: preferencesRef.current.audio,
      createdAt: job.createdAt,
      isJob: true,
      restored: true,
      deliveryAttempted: job.deliveryAttempted,
      deliveryFailed: job.deliveryFailed,
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
          true,
        );
      }
    });
    return () => {
      active = false;
      for (const activity of restoredActivities) stopPolling(activity.id);
    };
  }, [replaceActivities, stopPolling]);

  const startOperation = useCallback(
    async (
      next: DownloadRequest,
      options?: {
        destination?: DownloadDestination;
        preferredDeviceId?: string;
        /** Repeats an earlier job POST whose outcome is unknown. */
        idempotencyKey?: string;
      },
    ) => {
      const snapshot = preferencesRef.current;
      const destination =
        options?.destination ??
        getEffectiveDestination(deviceProfileRef.current, snapshot.destination);
      const key = requestKey(next);
      const existing = activitiesRef.current.find(
        (activity) => activity.key === key,
      );
      if (existing) {
        // The same request is still running: surface it instead of sending
        // a duplicate. A finished one is replaced by the new attempt.
        if (activeStatuses.has(existing.status)) {
          setActivityDismissed(existing.id, false);
          publishActivity(existing);
          return;
        }
        removeActivity(existing.id);
      }
      const id = crypto.randomUUID();
      const isJob = requiresBackgroundJob(next);
      // One Idempotency-Key per user action: a retry of the same action
      // reuses it, so the API returns the job it may already have created.
      let idempotencyKey = options?.idempotencyKey ?? crypto.randomUUID();
      let jobRequest: string | null = null;
      // One controller serves the user's Cancel and the 25 s deadline.
      const controller = new AbortController();
      const deadline = window.setTimeout(
        () =>
          controller.abort(
            new DOMException("Resolve deadline exceeded", "TimeoutError"),
          ),
        25_000,
      );
      abortersRef.current.set(id, controller);
      addActivity({
        id,
        key,
        request: next,
        status: "resolving",
        current: 0,
        total: requestEpisodeCount(next),
        packageName: next.title,
        episodes: [],
        destination,
        preferredAudio: snapshot.audio,
        createdAt: Date.now(),
        isJob,
      });
      const signal = controller.signal;
      try {
        if (isJob) {
          jobRequest = JSON.stringify(jobBody(next, snapshot));
          let response: { data: JobReceipt };
          try {
            response = await postJob(next.slug, jobRequest, idempotencyKey, {
              signal,
            });
          } catch (error) {
            // 409/422: the key is spent (too many repeats) or belongs to a
            // different body (preferences changed). This is a new attempt.
            if (
              !(error instanceof ApiResponseError) ||
              (error.status !== 409 && error.status !== 422)
            )
              throw error;
            idempotencyKey = crypto.randomUUID();
            response = await postJob(next.slug, jobRequest, idempotencyKey, {
              signal,
            });
          }
          abortersRef.current.delete(id);
          const { missingEpisodeNumbers, ...receipt } = response.data;
          updateActivity(id, {
            receipt,
            status: "processing",
            missingNumbers: missingEpisodeNumbers?.length
              ? missingEpisodeNumbers
              : undefined,
          });
          void pollJob(id, receipt);
          return;
        }
        const response = await apiFetch<{
          data: { packageName: string; episodes: ResolvedEpisode[] };
        }>(
          `/anime/${encodeURIComponent(next.slug)}/downloads/resolve`,
          {
            method: "POST",
            signal,
            body: JSON.stringify({
              episodeNumbers: next.episodeNumbers,
              audio: snapshot.audio,
              providers: snapshot.providers,
              ...(next.refresh ? { refresh: true } : {}),
            }),
          },
          true,
        );
        abortersRef.current.delete(id);
        updateActivity(
          id,
          {
            packageName: response.data.packageName,
            episodes: response.data.episodes,
            current: response.data.episodes.length,
          },
          false,
        );
        await deliver(id, { deviceId: options?.preferredDeviceId });
      } catch (error) {
        abortersRef.current.delete(id);
        const abandoned =
          isUserAbort(signal) || error instanceof ApiTimeoutError;
        // The job POST may have reached the API anyway: cancel that job.
        if (abandoned && jobRequest)
          void cancelAbandonedJob(next.slug, jobRequest, idempotencyKey);
        if (isUserAbort(signal)) {
          updateActivity(id, { status: "cancelled" });
          return;
        }
        updateActivity(id, {
          status: "error",
          retryable:
            !(error instanceof SelectionTooLargeError) && retryable(error),
          // Unknown outcome: "Reintentar" repeats the same job request.
          retryKey:
            jobRequest && outcomeUnknown(error) ? idempotencyKey : undefined,
          failure:
            error instanceof SelectionTooLargeError
              ? {
                  title: "Selección demasiado grande",
                  detail: `Puedes enviar hasta ${formatNumber(MAX_JOB_EPISODES)} episodios a la vez. Usa «Descargar todo» o un rango.`,
                }
              : describeApiError(error),
        });
      } finally {
        window.clearTimeout(deadline);
      }
    },
    [
      addActivity,
      deliver,
      pollJob,
      publishActivity,
      removeActivity,
      setActivityDismissed,
      updateActivity,
    ],
  );

  const preparePortableDownload = useCallback(
    async (next: DownloadRequest) => {
      const deviceId = selectedDeviceIdRef.current;
      if (!isMyJdConnected() || !deviceId) {
        showDevicePanel({ request: next });
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
          showDevicePanel(
            { request: next },
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
        showDevicePanel({ request: next }, describeMyJdError(error));
      } finally {
        setDevicesLoading(false);
      }
    },
    [rememberDevice, showDevicePanel, startOperation],
  );

  const openDownload = useCallback(
    (next: DownloadRequest) => {
      // Device picker, link list and fallbacks all live in the drawer.
      preloadDownloadDrawer();
      const profile = getDeviceProfile();
      deviceProfileRef.current = profile;
      setDeviceProfile(profile);
      document.documentElement.dataset.device = profile;
      const running = activitiesRef.current.find(
        (activity) =>
          activity.key === requestKey(next) &&
          activeStatuses.has(activity.status),
      );
      if (running) {
        setActivityDismissed(running.id, false);
        publishActivity(running);
        return;
      }
      const dispatch = planDownloadDispatch({
        profile,
        storedDestination: preferencesRef.current.destination,
        myJdConnected: isMyJdConnected(),
        selectedDeviceId: selectedDeviceIdRef.current,
      });
      if (dispatch.action === "configure-myjd") {
        showDevicePanel({ request: next });
        return;
      }
      if (profile === "portable" && dispatch.destination === "MYJD") {
        void preparePortableDownload(next);
        return;
      }
      void startOperation(next, { destination: dispatch.destination });
    },
    [
      preparePortableDownload,
      publishActivity,
      setActivityDismissed,
      showDevicePanel,
      startOperation,
    ],
  );

  const openSettings = useCallback(() => {
    setMode("settings");
    drawerOpenRef.current = true;
    drawer.open();
  }, [drawer, setMode]);

  const openDeviceSettings = useCallback(() => {
    showDevicePanel({});
  }, [showDevicePanel]);

  const cancelActivity = useCallback(
    async (id: string) => {
      const activity = findIn(activitiesRef.current, id);
      if (!activity) return;
      const controller = abortersRef.current.get(id);
      if (controller) {
        controller.abort("user-cancel");
        return;
      }
      const receipt = activity.receipt;
      if (!receipt || activity.cancelling) return;
      updateActivity(id, { cancelling: true });
      try {
        const response = await apiFetch<{ data: Pick<JobData, "status"> }>(
          `/download-jobs/${receipt.jobId}/cancel`,
          {
            method: "POST",
            headers: { authorization: `Bearer ${receipt.accessToken}` },
          },
          true,
        );
        const current = findIn(activitiesRef.current, id);
        if (!current) return;
        // Only a job still being resolved can be cancelled. If it finished
        // first, the API returns its final status unchanged: its links are
        // (being) delivered, so the cancel changes nothing here.
        if (
          response.data?.status !== "CANCELLED" ||
          current.status !== "processing"
        ) {
          const stillPolling = current.status === "processing";
          updateActivity(id, { cancelling: false }, stillPolling);
          // Pick up the final state now instead of at the next poll.
          if (stillPolling && current.receipt)
            void pollJob(id, current.receipt);
          return;
        }
        stopPolling(id);
        updateActivity(id, {
          receipt: undefined,
          status: "cancelled",
          cancelling: false,
        });
      } catch (error) {
        const current = findIn(activitiesRef.current, id);
        if (!current) return;
        updateActivity(
          id,
          { cancelling: false },
          current.status === "processing",
        );
        const friendly = describeApiError(error);
        toast.danger("No se pudo cancelar", {
          description: `${describeRequest(activity.request)}. ${friendly.detail}`,
          timeout: 8_000,
        });
      }
    },
    [pollJob, stopPolling, updateActivity],
  );

  const retryFailed = useCallback(
    async (id: string) => {
      const activity = findIn(activitiesRef.current, id);
      if (!activity) return;
      const failed = failedEpisodeNumbers(deliverableEpisodes(activity));
      if (activity.receipt) {
        updateActivity(id, { retrying: true });
        try {
          await apiFetch(
            `/download-jobs/${activity.receipt.jobId}/retry`,
            {
              method: "POST",
              headers: {
                authorization: `Bearer ${activity.receipt.accessToken}`,
              },
            },
            true,
          );
          updateActivity(id, {
            status: "processing",
            onlyEpisodes: failed.length ? failed : undefined,
            deliveredVia: undefined,
            current: 0,
          });
          void pollJob(id, activity.receipt);
        } catch (error) {
          updateActivity(id, { retrying: false });
          toast.danger("No se pudo reintentar", {
            description: describeApiError(error).detail,
            timeout: 8_000,
          });
        }
        return;
      }
      if (!failed.length) return;
      removeActivity(id);
      void startOperation(
        {
          slug: activity.request.slug,
          title: activity.request.title,
          episodeNumbers: failed,
          refresh: true,
        },
        { destination: activity.deliveredVia ?? activity.destination },
      );
    },
    [pollJob, removeActivity, startOperation, updateActivity],
  );

  const copyActivityLinks = useCallback(
    async (id: string) => {
      const activity = findIn(activitiesRef.current, id);
      if (!activity) return;
      const episodes = deliverableEpisodes(activity);
      const urls = collectUrls(episodes);
      if (!urls.length) return;
      const copied = await copyLinks(urls);
      if (!copied) {
        showLinks(id);
        return;
      }
      if (activity.status === "handed-off" || activity.status === "partial") {
        toast.success("Enlaces copiados", {
          description: `${describeRequest(activity.request)} · ${describeLinks(episodes)}.`,
          timeout: 4_000,
        });
        return;
      }
      const failedCount = failedEpisodeNumbers(episodes).length;
      updateActivity(id, {
        status: failedCount > 0 ? "partial" : "handed-off",
        deliveredVia: "COPY",
        failure: undefined,
        copyBlocked: false,
        interrupted: false,
        receipt: failedCount > 0 ? activity.receipt : undefined,
      });
      if (deviceActivityIdRef.current === id) drawer.close();
    },
    [drawer, showLinks, updateActivity],
  );

  /** The links panel copied them by hand: record the delivery. */
  const markCopied = useCallback(
    (id: string) => {
      const activity = findIn(activitiesRef.current, id);
      if (!activity || !unfinishedStatuses.has(activity.status)) return;
      const failedCount = failedEpisodeNumbers(
        deliverableEpisodes(activity),
      ).length;
      updateActivity(id, {
        status: failedCount > 0 ? "partial" : "handed-off",
        deliveredVia: "COPY",
        failure: undefined,
        copyBlocked: false,
        interrupted: false,
        receipt: failedCount > 0 ? activity.receipt : undefined,
      });
    },
    [updateActivity],
  );

  const runAction = useCallback(
    (id: string, action: ActivityAction) => {
      const activity = findIn(activitiesRef.current, id);
      if (!activity) return;
      switch (action) {
        case "cancel":
          void cancelActivity(id);
          return;
        case "deliver":
          void deliver(id);
          return;
        case "copy":
          void copyActivityLinks(id);
          return;
        case "show-links":
          showLinks(id);
          return;
        case "use-myjd":
          updateActivity(id, { destination: "MYJD" }, false);
          void deliver(id, { destination: "MYJD" });
          return;
        case "use-cnl":
          updateActivity(id, { destination: "CNL" }, false);
          void deliver(id, { destination: "CNL" });
          return;
        case "choose-device":
          requestDevice(id);
          return;
        case "retry":
          removeActivity(id);
          void startOperation(activity.request, {
            idempotencyKey: activity.retryKey,
          });
          return;
        case "retry-failed":
          void retryFailed(id);
          return;
        case "preferences":
          openSettings();
          return;
      }
    },
    [
      cancelActivity,
      copyActivityLinks,
      deliver,
      openSettings,
      removeActivity,
      requestDevice,
      retryFailed,
      showLinks,
      startOperation,
      updateActivity,
    ],
  );

  useEffect(() => {
    actionRef.current = runAction;
  }, [runAction]);

  const reopenDismissedActivity = useCallback(
    (activityId: string) => {
      const activity = findIn(activitiesRef.current, activityId);
      if (!activity) return;
      setActivityDismissed(activity.id, false);
      if (activity.status === "waiting-device") {
        requestDevice(activity.id);
        return;
      }
      publishActivity(activity);
    },
    [publishActivity, requestDevice, setActivityDismissed],
  );

  function toggleProvider(provider: DownloadProviderId) {
    const current = preferencesRef.current;
    const providers = current.providers.includes(provider)
      ? current.providers.filter((entry) => entry !== provider)
      : [...current.providers, provider];
    if (!providers.length) {
      toast.warning("Mantén al menos un proveedor", {
        description: "Necesitas al menos uno para buscar los enlaces.",
        timeout: 4_000,
      });
      return;
    }
    savePreferences({ ...current, providers });
  }

  async function connect(email: string, password: string) {
    if (connecting) return;
    setDeviceError(null);
    setConnecting(true);
    try {
      const available = await connectMyJd(email, password);
      setMyJdConnected(true);
      setDevices(available.map(({ id, name }) => ({ id, name })));
    } catch (error) {
      await disconnectMyJd().catch(() => undefined);
      setMyJdConnected(false);
      setDeviceError(describeMyJdError(error));
    } finally {
      setConnecting(false);
    }
  }

  async function sendDevice(deviceId: string) {
    const portable = deviceProfileRef.current === "portable";
    const stagedRequest = pendingRequestRef.current;
    const activity = deviceActivityId
      ? findIn(activitiesRef.current, deviceActivityId)
      : null;
    if (activity && !["waiting-device", "ready"].includes(activity.status))
      return;
    if (portable || stagedRequest) rememberDevice(deviceId);
    if (stagedRequest) {
      pendingRequestRef.current = null;
      setPendingRequest(null);
      drawer.close();
      void startOperation(stagedRequest, {
        destination: "MYJD",
        preferredDeviceId: deviceId,
      });
      return;
    }
    if (!activity) {
      if (portable) drawer.close();
      return;
    }
    drawer.close();
    void deliver(activity.id, { destination: "MYJD", deviceId });
  }

  function chooseAlternative(destination: "COPY" | "CNL") {
    const stagedRequest = pendingRequestRef.current;
    const activityId = deviceActivityIdRef.current;
    pendingRequestRef.current = null;
    setPendingRequest(null);
    if (stagedRequest) {
      drawer.close();
      void startOperation(stagedRequest, { destination });
      return;
    }
    if (!activityId) return;
    updateActivity(activityId, { destination }, false);
    if (destination === "COPY") {
      // Copy first (still inside the click) and let the result close it.
      void copyActivityLinks(activityId);
      return;
    }
    drawer.close();
    void deliver(activityId, { destination });
  }

  async function resetMyJdConnection() {
    try {
      await disconnectMyJd();
    } catch {
      // The local session is dropped either way.
    } finally {
      setMyJdConnected(false);
      setDevices([]);
      setDeviceError(null);
      rememberDevice(null);
    }
  }

  const getRequestStatus = useCallback(
    (request: DownloadRequest) => {
      const key = requestKey(request);
      return activities.find((activity) => activity.key === key)?.status;
    },
    [activities],
  );
  const getEpisodeStatus = useCallback(
    (slug: string, episodeNumber: number) =>
      getRequestStatus({ slug, title: "", episodeNumbers: [episodeNumber] }),
    [getRequestStatus],
  );

  const dismissedPending = activities.filter(
    (activity) =>
      dismissedIds.has(activity.id) && unfinishedStatuses.has(activity.status),
  );
  const deviceActivity = deviceActivityId
    ? activities.find((activity) => activity.id === deviceActivityId)
    : undefined;
  const deviceDeliveryPending = deviceActivity?.status === "sending";
  const linksActivity = linksActivityId
    ? activities.find((activity) => activity.id === linksActivityId)
    : undefined;
  const portable = deviceProfile === "portable";
  const effectiveDestination = getEffectiveDestination(
    deviceProfile,
    preferences.destination,
  );
  const drawerTitle =
    mode === "settings"
      ? "Preferencias de descarga"
      : mode === "links"
        ? "Enlaces de descarga"
        : myJdConnected
          ? "Elegir dispositivo"
          : "Conectar MyJDownloader";
  const drawerSummary =
    mode === "devices"
      ? pendingRequest
        ? describeRequest(pendingRequest)
        : deviceActivity
          ? describeRequest(deviceActivity.request)
          : null
      : mode === "links" && linksActivity
        ? `${describeRequest(linksActivity.request)} · ${describeLinks(deliverableEpisodes(linksActivity))}`
        : null;

  return (
    <DownloadContext.Provider
      value={{
        openDownload,
        getEpisodeStatus,
        getRequestStatus,
        openSettings,
        preferences,
        deviceProfile,
        dockSlot,
      }}
    >
      {children}
      <DownloadDock
        onSlot={setDockSlot}
        pending={dismissedPending}
        portable={deviceProfile === "portable"}
        onReopen={reopenDismissedActivity}
      />
      {drawerLoaded && (
        <DownloadDrawer
          state={drawer}
          title={drawerTitle}
          summary={drawerSummary}
          content={
            mode === "settings"
              ? {
                  mode,
                  props: {
                    preferences,
                    savePreferences,
                    toggleProvider,
                    portable,
                    effectiveDestination,
                    selectedDeviceName:
                      devices.find((device) => device.id === selectedDeviceId)
                        ?.name ??
                      (selectedDeviceId ? "Dispositivo recordado" : null),
                    myJdConnected,
                    openDeviceSettings,
                  },
                }
              : mode === "links"
                ? {
                    mode,
                    props: {
                      urls: linksActivity
                        ? collectUrls(deliverableEpisodes(linksActivity))
                        : [],
                      onCopied: () => {
                        if (linksActivity) markCopied(linksActivity.id);
                      },
                    },
                  }
                : {
                    mode,
                    props: {
                      portable,
                      connected: myJdConnected,
                      connecting,
                      devices,
                      devicesLoading,
                      deviceError,
                      hasTarget: Boolean(pendingRequest || deviceActivity),
                      deliveryPending: deviceDeliveryPending,
                      onConnect: (email, password) =>
                        void connect(email, password),
                      onRefresh: () => void refreshDevices(),
                      onReset: () => void resetMyJdConnection(),
                      onSelectDevice: (deviceId) => void sendDevice(deviceId),
                      onCopyInstead: () => chooseAlternative("COPY"),
                      onUseClickNLoad: () => chooseAlternative("CNL"),
                    },
                  }
          }
        />
      )}
    </DownloadContext.Provider>
  );
}

/**
 * Bottom stack above the mobile nav: the pending-download button and any
 * page bar (episode selection) share one flex column, so they never overlap.
 * Its height is published as --download-dock-height for the toast region and
 * page padding.
 */
function DownloadDock({
  onSlot,
  pending,
  portable,
  onReopen,
}: {
  onSlot: (element: HTMLElement | null) => void;
  pending: Activity[];
  portable: boolean;
  onReopen: (id: string) => void;
}) {
  const dockRef = useRef<HTMLDivElement>(null);
  // A landmark only while it shows something (button or selection bar), so
  // its controls are reachable from landmark navigation.
  const [occupied, setOccupied] = useState(false);

  useEffect(() => {
    const dock = dockRef.current;
    if (!dock || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      const height = dock.getBoundingClientRect().height;
      setOccupied(height > 0);
      root.style.setProperty(
        "--download-dock-height",
        height > 0 ? `${Math.ceil(height) + 12}px` : "0px",
      );
    });
    observer.observe(dock);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--download-dock-height");
    };
  }, []);

  const first = pending[0];
  return (
    <div
      ref={dockRef}
      role={occupied ? "region" : undefined}
      aria-label={occupied ? "Descargas y selección" : undefined}
      className="download-dock pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-clearance)+1rem)] z-40 mx-auto flex w-full max-w-[1600px] flex-col items-end gap-3 px-4 sm:px-6"
    >
      {first && (
        <Button
          className="pointer-events-auto min-h-11 gap-2.5 rounded-full bg-surface-tertiary px-4 text-sm font-semibold text-accent-soft-foreground shadow-[0_16px_40px_rgb(0_0_0/0.4)] outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus"
          onPress={() => onReopen(first.id)}
          aria-label={
            pending.length === 1
              ? `Mostrar descarga: ${describeRequest(first.request)}`
              : `Mostrar ${plural(pending.length, "descarga pendiente", "descargas pendientes")}`
          }
        >
          <DockIcon activity={first} />
          <span className="max-w-[60vw] truncate">
            {pending.length > 1
              ? plural(
                  pending.length,
                  "descarga pendiente",
                  "descargas pendientes",
                )
              : dockLabel(first, portable)}
          </span>
        </Button>
      )}
      <div ref={onSlot} className="flex w-full justify-center empty:hidden" />
    </div>
  );
}

/** The dock names the job with the same words as its toast. */
function dockLabel(activity: Activity, portable: boolean) {
  const view = presentActivity(activity, { portable });
  return view.progress
    ? `${view.title} · ${formatProgress(view.progress.current, view.progress.total)}`
    : view.title;
}

function DockIcon({ activity }: { activity: Activity }) {
  if (activity.status === "processing" && activity.total > 0) {
    return (
      <ProgressCircle
        aria-label="Progreso"
        value={activity.current}
        maxValue={activity.total}
        size="sm"
        className="size-5"
      >
        <ProgressCircle.Track className="size-5">
          <ProgressCircle.TrackCircle className="stroke-white/20" />
          <ProgressCircle.FillCircle className="stroke-brand" />
        </ProgressCircle.Track>
      </ProgressCircle>
    );
  }
  return <Download size={16} aria-hidden="true" />;
}
