"use client";

import {
  AlertDialog,
  Button,
  ProgressCircle,
  toast,
  useOverlayState,
} from "@heroui/react";
import { Download } from "lucide-react";
import dynamic from "next/dynamic";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
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
  RequestTitle,
  activeStatuses,
  deliverableEpisodes,
  deliveredSentence,
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
  describeConfirmation,
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
import { needsConfirmation, planDownloadDispatch } from "./download-policy";
import {
  loadActiveDownloadJobs,
  saveActiveDownloadJobs,
  type PersistedDownloadJob,
} from "./download-job-storage";
import type { MyJdDevice } from "./download-panels";
import { useRemoteDownloads } from "./use-remote-downloads";
import { RemoteDownloadDrawer } from "./remote-panels";
import type {
  AudioPreference,
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
const MAX_QUICK_EPISODES = 50;
/** Largest explicit list a job accepts (scope EPISODES). */
export const MAX_JOB_EPISODES = 5_000;

type JobRequestBody =
  | components["schemas"]["AllDownloadJobRequestDto"]
  | components["schemas"]["RangeDownloadJobRequestDto"]
  | components["schemas"]["EpisodesDownloadJobRequestDto"];
type JobReceipt = components["schemas"]["DownloadJobReceiptDto"];
type JobData = components["schemas"]["DownloadJobDataDto"];
type ResolvedLinks = {
  data: { packageName: string; episodes: ResolvedEpisode[] };
};

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

function resolveLinks(
  request: DownloadRequest,
  { audio, providers }: DownloadPreferences,
  signal?: AbortSignal,
) {
  return apiFetch<ResolvedLinks>(
    `/anime/${encodeURIComponent(request.slug)}/downloads/resolve`,
    {
      method: "POST",
      signal,
      body: JSON.stringify({
        episodeNumbers: request.episodeNumbers,
        audio,
        providers,
        refresh: request.refresh,
      }),
    },
    true,
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

/** A call on a job, authorized by its receipt's capability token. */
function jobApi<T>(receipt: SavedJob, path = "", method?: "POST") {
  return apiFetch<T>(
    `/download-jobs/${receipt.jobId}${path}`,
    { method, headers: { authorization: `Bearer ${receipt.accessToken}` } },
    true,
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
class SelectionTooLargeError extends Error {}

interface DownloadContextValue {
  openDownload: (request: DownloadRequest) => void;
  /** Status of the latest activity for exactly this request, if any. */
  getRequestStatus: (
    request: DownloadRequest,
  ) => DownloadActivityStatus | undefined;
  openSettings: () => void;
  preferences: DownloadPreferences;
  deviceProfile: DeviceProfile;
  /** Where links go on this device (a phone sends Click'n'Load to
   *  MyJDownloader). */
  destination: DownloadDestination;
  desktopTargetLabel?: string;
  /** Fixed bottom stack where page-level bars (episode selection) portal in,
   *  so they never overlap the pending-download button. */
  dockSlot: HTMLElement | null;
  /** An episode's links for the current preferences, if already resolved. */
  cachedEpisodeLinks: (request: DownloadRequest) => EpisodeLinks | undefined;
  /** Resolves (once, then from cache) an episode's links. A failure or an
   *  episode without links is reported with a toast and gives null. */
  resolveEpisodeLinks: (
    request: DownloadRequest,
  ) => Promise<EpisodeLinks | null>;
  /** Copies resolved links (one provider's or all) with the usual toast. */
  copyEpisodeLinks: (
    request: DownloadRequest,
    links: EpisodeLinks,
    provider?: DownloadProviderId,
  ) => void;
}

export interface EpisodeLinks {
  packageName: string;
  episode: ResolvedEpisode;
}

/** How long an episode's resolved links are reused (the API keeps them at
 *  least 15 minutes). */
const EPISODE_LINKS_TTL = 10 * 60_000;

interface EpisodeLinksEntry {
  promise: Promise<EpisodeLinks | null>;
  value?: EpisodeLinks;
}

/** Resolved links depend on the audio and providers they were asked with. */
function episodeLinksKey(
  request: DownloadRequest,
  { audio, providers }: DownloadPreferences,
) {
  return `${requestKey(request)}|${audio}|${[...providers].sort().join(",")}`;
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

/** A new activity for `request`; what isn't given starts empty. */
function newActivity(
  request: DownloadRequest,
  preferredAudio: AudioPreference,
  fields: Pick<Activity, "status" | "destination" | "isJob"> &
    Partial<Activity>,
): Activity {
  return {
    id: crypto.randomUUID(),
    key: requestKey(request),
    request,
    current: 0,
    total: requestEpisodeCount(request),
    packageName: request.title,
    episodes: [],
    preferredAudio,
    createdAt: Date.now(),
    ...fields,
  };
}

/** The links reached `via`: done, or partial while episodes failed (the job
 *  receipt stays so they can be retried). */
function delivered(
  activity: Activity,
  via: DownloadDestination,
): Partial<Activity> {
  const failed =
    failedEpisodeNumbers(deliverableEpisodes(activity, via)).length > 0 ||
    (!activity.onlyEpisodes && (activity.failedCount ?? 0) > 0);
  return {
    status: failed ? "partial" : "handed-off",
    deliveredVia: via,
    receipt: failed ? activity.receipt : undefined,
    deliveryFailed: false,
    failure: undefined,
    interrupted: false,
    copyBlocked: false,
    noLinks: false,
  };
}

const resumableStatuses = new Set<DownloadActivityStatus>([
  "processing",
  "ready",
  "waiting-device",
  "sending",
]);

/** What a reload needs to pick a background job up again. */
function persistable(activity: Activity): PersistedDownloadJob[] {
  const { id, request, receipt, destination, createdAt, current, total } =
    activity;
  if (!receipt || !resumableStatuses.has(activity.status)) return [];
  return [
    {
      id,
      request,
      receipt,
      destination,
      createdAt,
      current,
      total,
      deliveryAttempted: activity.deliveryAttempted === true,
      deliveryFailed: activity.deliveryFailed === true,
    },
  ];
}

type StorageName = "localStorage" | "sessionStorage";

/** Web storage where the browser allows it: downloads work without it. */
function webStorage(name: StorageName): Storage | null {
  try {
    return window[name];
  } catch {
    return null;
  }
}

function store(name: StorageName, key: string, value: string | null) {
  try {
    if (value === null) webStorage(name)?.removeItem(key);
    else webStorage(name)?.setItem(key, value);
  } catch {
    // Full or blocked: the live state still works.
  }
}

function storedPreferences(): DownloadPreferences | null {
  const raw = webStorage("localStorage")?.getItem(storageKey);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Partial<DownloadPreferences>;
    return {
      audio: stored.audio === "DUB" ? "DUB" : defaults.audio,
      providers: stored.providers?.length
        ? stored.providers
        : defaults.providers,
      destination:
        stored.destination === "MYJD" ||
        stored.destination === "COPY" ||
        stored.destination === "DESKTOP"
          ? stored.destination
          : defaults.destination,
    };
  } catch {
    store("localStorage", storageKey, null);
    return null;
  }
}

function findIn(list: Activity[], id: string | null | undefined) {
  return id ? list.find((activity) => activity.id === id) : undefined;
}

/** State plus a ref to its latest value, for work that outlives a render
 *  (requests, polls, toasts). */
function useStateRef<T>(initial: T) {
  const [value, setValue] = useState(initial);
  const ref = useRef(initial);
  const set = useCallback((next: T) => {
    ref.current = next;
    setValue(next);
  }, []);
  return [value, set, ref] as const;
}

export function useDownloads() {
  const value = useContext(DownloadContext);
  if (!value) throw new Error("DownloadProvider is missing.");
  return value;
}

/** What the drawer shows and, for devices or links, what it acts on. */
interface DrawerPanel {
  mode: "settings" | "devices" | "links";
  /** A download waiting for a device before it starts. */
  request?: DownloadRequest;
  activityId?: string;
}

/**
 * Downloads, their toasts and the drawer. Handlers read the latest state
 * through refs, never from the render: toasts and requests keep the closures
 * of the render that started them.
 */
export function DownloadProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences, preferencesRef] = useStateRef(defaults);
  const [activities, setActivities, activitiesRef] = useStateRef<Activity[]>(
    [],
  );
  const [dismissedIds, setDismissedIds, dismissedIdsRef] = useStateRef(
    new Set<string>(),
  );
  const [deviceProfile, setDeviceProfile, deviceProfileRef] =
    useStateRef<DeviceProfile>("unknown");
  const [selectedDeviceId, setSelectedDeviceId, selectedDeviceIdRef] =
    useStateRef<string | null>(null);
  const [panel, setPanel, panelRef] = useStateRef<DrawerPanel>({
    mode: "settings",
  });
  const [devices, setDevices] = useState<MyJdDevice[]>([]);
  const [myJdConnected, setMyJdConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [dockSlot, setDockSlot] = useState<HTMLElement | null>(null);
  // The drawer mounts the first time it opens (fetching its code then) and
  // stays mounted, so closing still animates and reopening is instant.
  const [drawerLoaded, setDrawerLoaded] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<DownloadRequest | null>(
    null,
  );
  const confirmDialog = useOverlayState();
  const toastIds = useRef(new Map<string, string>());
  const pollsRef = useRef(new Map<string, { timeout?: number }>());
  const deliveringRef = useRef(new Set<string>());
  const abortersRef = useRef(new Map<string, AbortController>());
  const episodeLinksRef = useRef(new Map<string, EpisodeLinksEntry>());
  const mountedRef = useRef(false);
  const drawerOpenRef = useRef(false);

  const drawer = useOverlayState({
    onOpenChange: (isOpen) => {
      const wasOpen = drawerOpenRef.current;
      drawerOpenRef.current = isOpen;
      if (isOpen || !wasOpen) return;
      const { mode, activityId } = panelRef.current;
      const activity = findIn(activitiesRef.current, activityId);
      if (!activity) return;
      // The links panel stood in for its activity's toast: bring it back.
      if (mode === "links") publishActivity(activity);
      // Closing the picker leaves the job recoverable from the dock button.
      else if (activity.status === "waiting-device")
        setActivityDismissed(activity.id, true);
    },
  });
  const { open: openDrawer, close: closeDrawer } = drawer;
  const remote = useRemoteDownloads(drawer.isOpen && panel.mode === "settings");

  function showDrawer(next: DrawerPanel) {
    setPanel(next);
    setDrawerLoaded(true);
    openDrawer();
  }

  function setActivityDismissed(id: string, dismissed: boolean) {
    if (dismissedIdsRef.current.has(id) === dismissed) return;
    const next = new Set(dismissedIdsRef.current);
    if (dismissed) next.add(id);
    else next.delete(id);
    setDismissedIds(next);
  }

  function replaceActivities(next: Activity[]) {
    if (!mountedRef.current) return;
    setActivities(next);
    const session = webStorage("sessionStorage");
    if (session) saveActiveDownloadJobs(session, next.flatMap(persistable));
  }

  function stopPolling(id: string) {
    window.clearTimeout(pollsRef.current.get(id)?.timeout);
    pollsRef.current.delete(id);
  }

  function closeToast(activityId: string) {
    const toastId = toastIds.current.get(activityId);
    if (!toastId) return;
    // Forget it first so the close callback treats this as programmatic.
    toastIds.current.delete(activityId);
    toast.close(toastId);
  }

  function removeActivity(id: string) {
    stopPolling(id);
    abortersRef.current.get(id)?.abort("user-cancel");
    abortersRef.current.delete(id);
    setActivityDismissed(id, false);
    closeToast(id);
    replaceActivities(
      activitiesRef.current.filter((activity) => activity.id !== id),
    );
  }

  /** Shows or updates the activity's single toast in place. */
  function publishActivity(activity: Activity) {
    if (!mountedRef.current) return;
    if (
      activeStatuses.has(activity.status) &&
      dismissedIdsRef.current.has(activity.id)
    )
      return;
    // While the device picker or the links panel is open, it is the UI for
    // this activity: no toast on top of (or under) the drawer.
    const shown = panelRef.current;
    if (
      drawerOpenRef.current &&
      shown.activityId === activity.id &&
      (shown.mode === "links" || activity.status === "waiting-device")
    ) {
      closeToast(activity.id);
      return;
    }
    setActivityDismissed(activity.id, false);
    const view = presentActivity(activity, {
      portable: deviceProfileRef.current === "portable",
    });
    const title = <RequestTitle request={activity.request} />;
    const existing = toastIds.current.get(activity.id);
    let toastId = existing ?? "";
    const options = {
      description: (
        <ActivityToastBody
          view={view}
          onAction={(action) => runAction(activity.id, action)}
        />
      ),
      variant: view.variant,
      isLoading: view.isLoading,
      timeout: view.timeout,
      onClose: () => {
        if (toastIds.current.get(activity.id) !== toastId) return;
        toastIds.current.delete(activity.id);
        const current = findIn(activitiesRef.current, activity.id);
        if (!current) return;
        // Unfinished work stays reachable from the dock button.
        if (unfinishedStatuses.has(current.status))
          setActivityDismissed(current.id, true);
        else removeActivity(current.id);
      },
    };
    toastId = existing
      ? toast.update(existing, title, options)
      : toast(title, options);
    toastIds.current.set(activity.id, toastId);
  }

  /** Brings an activity's toast back, even one the user closed. */
  function surface(activity: Activity) {
    setActivityDismissed(activity.id, false);
    publishActivity(activity);
  }

  function addActivity(activity: Activity) {
    replaceActivities([activity, ...activitiesRef.current]);
    publishActivity(activity);
  }

  /** Frees a request's key for a new attempt. A running one is surfaced
   *  instead, and nothing new starts. */
  function claimKey(key: string) {
    const existing = activitiesRef.current.find(
      (activity) => activity.key === key,
    );
    if (existing && activeStatuses.has(existing.status)) {
      surface(existing);
      return false;
    }
    if (existing) removeActivity(existing.id);
    return true;
  }

  function updateActivity(
    id: string,
    changes: Partial<Activity>,
    publish = true,
  ) {
    const existing = findIn(activitiesRef.current, id);
    if (!existing) return;
    const updated = { ...existing, ...changes };
    replaceActivities(
      activitiesRef.current.map((activity) =>
        activity.id === id ? updated : activity,
      ),
    );
    if (publish) publishActivity(updated);
  }

  function savePreferences(next: DownloadPreferences) {
    setPreferences(next);
    store("localStorage", storageKey, JSON.stringify(next));
  }

  function rememberDevice(deviceId: string | null) {
    setSelectedDeviceId(deviceId);
    store("sessionStorage", selectedDeviceStorageKey, deviceId);
  }

  /** Drops the MyJDownloader session here, whatever the API answers. */
  async function dropMyJd(error: string | null) {
    await disconnectMyJd().catch(() => undefined);
    setMyJdConnected(false);
    setDevices([]);
    setDeviceError(error);
  }

  async function refreshDevices(keepError = false) {
    if (!isMyJdConnected()) {
      setMyJdConnected(false);
      setDevices([]);
      return;
    }
    setDevicesLoading(true);
    if (!keepError) setDeviceError(null);
    try {
      setDevices(await listMyJdDevices());
      setMyJdConnected(true);
    } catch (error) {
      await dropMyJd(describeMyJdError(error));
    } finally {
      setDevicesLoading(false);
    }
  }

  function showDevicePanel(
    target: Pick<DrawerPanel, "request" | "activityId">,
    error?: string,
  ) {
    setDeviceError(error ?? null);
    setMyJdConnected(isMyJdConnected());
    showDrawer({ mode: "devices", ...target });
    if (isMyJdConnected()) void refreshDevices(Boolean(error));
  }

  function requestDevice(activityId: string, error?: string) {
    showDevicePanel({ activityId }, error);
    updateActivity(activityId, {
      status: "waiting-device",
      destination: "MYJD",
      failure: undefined,
    });
  }

  function showLinks(activityId: string) {
    closeToast(activityId);
    showDrawer({ mode: "links", activityId });
  }

  function openSettings() {
    showDrawer({ mode: "settings" });
  }

  /** Sends the links to the activity's destination (set it before). */
  async function deliver(id: string, deviceId?: string) {
    const activity = findIn(activitiesRef.current, id);
    if (!activity) return;
    const { destination } = activity;
    const urls = collectUrls(deliverableEpisodes(activity));
    if (!urls.length) {
      updateActivity(id, {
        receipt: activity.status === "partial" ? activity.receipt : undefined,
        status: "error",
        noLinks: true,
      });
      return;
    }
    if (deliveringRef.current.has(id)) return;

    if (destination === "COPY") {
      // A closed toast hid the work; it didn't allow overwriting the
      // clipboard unannounced. The links wait for an explicit copy.
      if (dismissedIdsRef.current.has(id))
        updateActivity(id, { status: "ready" });
      else if (await copyLinks(urls))
        updateActivity(id, delivered(activity, "COPY"));
      else
        updateActivity(id, {
          status: "ready",
          copyBlocked: true,
          failure: undefined,
        });
      return;
    }

    const device = deviceId ?? selectedDeviceIdRef.current;
    if (destination === "MYJD" && (!device || !isMyJdConnected())) {
      requestDevice(id);
      return;
    }
    deliveringRef.current.add(id);
    updateActivity(id, {
      status: "sending",
      deliveryAttempted: true,
      deliveryFailed: false,
      failure: undefined,
      interrupted: false,
    });
    try {
      await (destination === "MYJD" && device
        ? sendToMyJd(device, activity.packageName, urls)
        : sendToClickNLoad(activity.packageName, urls));
    } catch (error) {
      if (destination === "MYJD") {
        if (deviceProfileRef.current === "portable") rememberDevice(null);
        updateActivity(
          id,
          { deliveryFailed: true, deliveryAttempted: false },
          false,
        );
        requestDevice(id, describeMyJdError(error));
      } else {
        // A refused connection proves nothing was delivered; a lost reply
        // after sending stays "attempted" so a reload warns about duplicates.
        const uncertain =
          error instanceof ClickNLoadError && error.maybeDelivered;
        updateActivity(id, {
          status: "ready",
          failure: describeClickNLoadError(error),
          deliveryFailed: !uncertain,
          deliveryAttempted: uncertain,
        });
      }
      return;
    } finally {
      deliveringRef.current.delete(id);
    }
    updateActivity(id, delivered(activity, destination));
  }

  async function pollJob(id: string, receipt: SavedJob, deferDelivery = false) {
    stopPolling(id);
    const session: { timeout?: number } = {};
    pollsRef.current.set(id, session);
    const live = () => pollsRef.current.get(id) === session;
    const pollIn = (delay: number) => {
      if (live()) session.timeout = window.setTimeout(() => void poll(), delay);
    };
    const end = (changes: Partial<Activity>) => {
      stopPolling(id);
      updateActivity(id, { receipt: undefined, ...changes });
    };
    const expired = () => Date.parse(receipt.expiresAt) <= Date.now();

    async function poll() {
      if (!live()) return;
      if (expired())
        return end({
          status: "error",
          failure: {
            title: "La descarga caducó",
            detail: "Vuelve a iniciarla para obtener enlaces actuales.",
          },
        });
      try {
        const { data: job } = await jobApi<{
          data: Omit<JobData, "episodes"> & { episodes: ResolvedEpisode[] };
        }>(receipt);
        if (!live()) return;
        const finished = !["QUEUED", "RUNNING"].includes(job.status);
        updateActivity(
          id,
          {
            status: "processing",
            reconnecting: false,
            restored: false,
            current: job.completedItems + job.failedItems,
            total: job.totalItems,
            episodes: job.episodes,
            packageName: job.packageName,
            failedCount: job.failedItems,
          },
          !finished,
        );
        if (!finished) return pollIn(jobPollInterval(job.totalItems));
        stopPolling(id);
        if (job.status === "CANCELLED")
          return end({ status: "cancelled", cancelling: false });
        const activity = findIn(activitiesRef.current, id);
        if (
          deferDelivery &&
          activity &&
          collectUrls(deliverableEpisodes(activity)).length > 0
        ) {
          updateActivity(id, {
            status: "ready",
            retrying: false,
            interrupted:
              activity.deliveryAttempted === true &&
              activity.deliveryFailed !== true,
          });
          return;
        }
        updateActivity(id, { retrying: false }, false);
        await deliver(id);
      } catch (error) {
        if (!live()) return;
        const status = error instanceof ApiResponseError ? error.status : 0;
        if (status === 401 || status === 404 || expired())
          return end({
            status: "error",
            failure: {
              title: "La descarga ya no está disponible",
              detail:
                "La autorización caducó. Vuelve a iniciar la descarga para continuar.",
            },
          });
        const retryAfter =
          error instanceof ApiResponseError ? (error.retryAfterMs ?? 0) : 0;
        if (status === 429) {
          // Rate limited: the job keeps running on the API. Wait as asked
          // and keep showing progress, not a lost connection.
          const current = findIn(activitiesRef.current, id);
          if (current?.reconnecting)
            updateActivity(id, { reconnecting: false });
          return pollIn(
            Math.max(retryAfter, jobPollInterval(current?.total ?? 0)),
          );
        }
        updateActivity(id, { status: "processing", reconnecting: true });
        pollIn(Math.max(retryAfter, 3_000));
      }
    }

    await poll();
  }

  async function startOperation(
    next: DownloadRequest,
    options: {
      destination?: DownloadDestination;
      preferredDeviceId?: string;
      /** Repeats an earlier job POST whose outcome is unknown. */
      idempotencyKey?: string;
    } = {},
  ) {
    const snapshot = preferencesRef.current;
    if (!claimKey(requestKey(next))) return;
    const activity = newActivity(next, snapshot.audio, {
      status: "resolving",
      destination:
        options.destination ??
        getEffectiveDestination(deviceProfileRef.current, snapshot.destination),
      isJob: requiresBackgroundJob(next),
    });
    const { id } = activity;
    // One Idempotency-Key per user action: a retry of the same action
    // reuses it, so the API returns the job it may already have created.
    let idempotencyKey = options.idempotencyKey ?? crypto.randomUUID();
    let jobRequest: string | null = null;
    // One controller serves the user's Cancel and the 25 s deadline.
    const controller = new AbortController();
    const { signal } = controller;
    const deadline = window.setTimeout(
      () =>
        controller.abort(
          new DOMException("Resolve deadline exceeded", "TimeoutError"),
        ),
      25_000,
    );
    abortersRef.current.set(id, controller);
    addActivity(activity);
    try {
      if (activity.isJob) {
        const body = JSON.stringify(jobBody(next, snapshot));
        jobRequest = body;
        const response = await postJob(next.slug, body, idempotencyKey, {
          signal,
        }).catch((error: unknown) => {
          // 409/422: the key is spent (too many repeats) or belongs to a
          // different body (preferences changed). This is a new attempt.
          if (
            !(error instanceof ApiResponseError) ||
            (error.status !== 409 && error.status !== 422)
          )
            throw error;
          idempotencyKey = crypto.randomUUID();
          return postJob(next.slug, body, idempotencyKey, { signal });
        });
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
      const { data } = await resolveLinks(next, snapshot, signal);
      abortersRef.current.delete(id);
      updateActivity(
        id,
        {
          packageName: data.packageName,
          episodes: data.episodes,
          current: data.episodes.length,
        },
        false,
      );
      await deliver(id, options.preferredDeviceId);
    } catch (error) {
      abortersRef.current.delete(id);
      const cancelled = signal.aborted && signal.reason === "user-cancel";
      // The job POST may have reached the API anyway: cancel that job.
      if (jobRequest && (cancelled || error instanceof ApiTimeoutError))
        void cancelAbandonedJob(next.slug, jobRequest, idempotencyKey);
      if (cancelled) {
        updateActivity(id, { status: "cancelled" });
        return;
      }
      const tooLarge = error instanceof SelectionTooLargeError;
      updateActivity(id, {
        status: "error",
        retryable: !tooLarge && retryable(error),
        // Unknown outcome: "Reintentar" repeats the same job request.
        retryKey:
          jobRequest && outcomeUnknown(error) ? idempotencyKey : undefined,
        failure: tooLarge
          ? {
              title: "Selección demasiado grande",
              detail: `Puedes enviar hasta ${formatNumber(MAX_JOB_EPISODES)} episodios a la vez. Usa «Descargar todo» o un rango.`,
            }
          : describeApiError(error),
      });
    } finally {
      window.clearTimeout(deadline);
    }
  }

  async function preparePortableDownload(
    next: DownloadRequest,
    deviceId: string,
  ) {
    setDevicesLoading(true);
    try {
      const available = await listMyJdDevices();
      setDevices(available);
      if (available.some((device) => device.id === deviceId)) {
        void startOperation(next, {
          destination: "MYJD",
          preferredDeviceId: deviceId,
        });
        return;
      }
      rememberDevice(null);
      showDevicePanel(
        { request: next },
        "El dispositivo guardado ya no está disponible. Elige otro.",
      );
    } catch (error) {
      const message = describeMyJdError(error);
      await dropMyJd(message);
      showDevicePanel({ request: next }, message);
    } finally {
      setDevicesLoading(false);
    }
  }

  function dispatchDownload(next: DownloadRequest) {
    if (preferencesRef.current.destination === "DESKTOP") {
      remote.start(next, openSettings);
      return;
    }
    const plan = planDownloadDispatch({
      profile: deviceProfileRef.current,
      storedDestination: preferencesRef.current.destination,
      myJdConnected: isMyJdConnected(),
      selectedDeviceId: selectedDeviceIdRef.current,
    });
    if (plan.action === "configure-myjd") showDevicePanel({ request: next });
    // Only a phone sending to MyJDownloader checks its remembered device.
    else if (plan.preferredDeviceId)
      void preparePortableDownload(next, plan.preferredDeviceId);
    else void startOperation(next, { destination: plan.destination });
  }

  function openDownload(next: DownloadRequest) {
    // Device picker, link list and fallbacks all live in the drawer.
    preloadDownloadDrawer();
    const running = activitiesRef.current.find(
      (activity) =>
        preferencesRef.current.destination !== "DESKTOP" &&
        activity.key === requestKey(next) &&
        activeStatuses.has(activity.status),
    );
    if (running) surface(running);
    else if (
      needsConfirmation(
        next,
        getEffectiveDestination(
          deviceProfileRef.current,
          preferencesRef.current.destination,
        ),
      )
    ) {
      setConfirmRequest(next);
      confirmDialog.open();
    } else dispatchDownload(next);
  }

  async function cancelActivity(id: string) {
    const activity = findIn(activitiesRef.current, id);
    if (!activity) return;
    const controller = abortersRef.current.get(id);
    if (controller) return controller.abort("user-cancel");
    const { receipt } = activity;
    if (!receipt || activity.cancelling) return;
    updateActivity(id, { cancelling: true });
    try {
      const response = await jobApi<{ data: Pick<JobData, "status"> }>(
        receipt,
        "/cancel",
        "POST",
      );
      const current = findIn(activitiesRef.current, id);
      if (!current) return;
      if (
        response.data?.status === "CANCELLED" &&
        current.status === "processing"
      ) {
        stopPolling(id);
        updateActivity(id, {
          receipt: undefined,
          status: "cancelled",
          cancelling: false,
        });
        return;
      }
      // Only a job still being resolved can be cancelled. If it finished
      // first, the API returns its final status unchanged: its links are
      // (being) delivered, so the cancel changes nothing here.
      const stillPolling = current.status === "processing";
      updateActivity(id, { cancelling: false }, stillPolling);
      // Pick up the final state now instead of at the next poll.
      if (stillPolling && current.receipt) void pollJob(id, current.receipt);
    } catch (error) {
      const current = findIn(activitiesRef.current, id);
      if (!current) return;
      updateActivity(
        id,
        { cancelling: false },
        current.status === "processing",
      );
      toast.danger(<RequestTitle request={activity.request} />, {
        description: `No se pudo cancelar. ${describeApiError(error).detail}`,
        timeout: 8_000,
      });
    }
  }

  async function retryFailed(id: string) {
    const activity = findIn(activitiesRef.current, id);
    if (!activity) return;
    const failed = failedEpisodeNumbers(deliverableEpisodes(activity));
    const { receipt } = activity;
    if (receipt) {
      updateActivity(id, { retrying: true });
      try {
        await jobApi(receipt, "/retry", "POST");
        updateActivity(id, {
          status: "processing",
          onlyEpisodes: failed.length ? failed : undefined,
          deliveredVia: undefined,
          current: 0,
        });
        void pollJob(id, receipt);
      } catch (error) {
        updateActivity(id, { retrying: false });
        toast.danger(<RequestTitle request={activity.request} />, {
          description: `No se pudo reintentar. ${describeApiError(error).detail}`,
          timeout: 8_000,
        });
      }
      return;
    }
    if (!failed.length) return;
    removeActivity(id);
    const { slug, title } = activity.request;
    void startOperation(
      { slug, title, episodeNumbers: failed, refresh: true },
      { destination: activity.deliveredVia ?? activity.destination },
    );
  }

  /** Records links copied outside deliver (a toast or panel button), also
   *  those a JDownloader could not take. */
  function markCopied(id: string) {
    const activity = findIn(activitiesRef.current, id);
    if (
      activity &&
      (unfinishedStatuses.has(activity.status) || activity.noLinks)
    )
      updateActivity(id, delivered(activity, "COPY"));
  }

  async function copyActivityLinks(id: string) {
    const activity = findIn(activitiesRef.current, id);
    const episodes = activity ? deliverableEpisodes(activity, "COPY") : [];
    const urls = collectUrls(episodes);
    if (!activity || !urls.length) return;
    if (!(await copyLinks(urls))) return showLinks(id);
    if (unfinishedStatuses.has(activity.status) || activity.noLinks) {
      markCopied(id);
      if (drawerOpenRef.current && panelRef.current.activityId === id)
        closeDrawer();
      return;
    }
    toast.success(<RequestTitle request={activity.request} />, {
      description: deliveredSentence(episodes, "COPY", activity.provider),
      timeout: 4_000,
    });
  }

  function cachedEpisodeLinks(request: DownloadRequest) {
    return episodeLinksRef.current.get(
      episodeLinksKey(request, preferencesRef.current),
    )?.value;
  }

  function resolveEpisodeLinks(request: DownloadRequest) {
    const snapshot = preferencesRef.current;
    const key = episodeLinksKey(request, snapshot);
    const cache = episodeLinksRef.current;
    const cached = cache.get(key);
    if (cached) return cached.promise;
    const forget = () => {
      if (cache.get(key) === entry) cache.delete(key);
    };
    // A failed lookup shows as the episode's toast, offering the usual
    // retry (a full copy) or, without links, the preferences.
    const fail = (changes: Partial<Activity>) => {
      forget();
      if (claimKey(requestKey(request)))
        addActivity(
          newActivity(request, snapshot.audio, {
            status: "error",
            destination: "COPY",
            isJob: false,
            ...changes,
          }),
        );
      return null;
    };
    const entry: EpisodeLinksEntry = {
      promise: resolveLinks(request, snapshot).then(
        ({ data }) => {
          const episode = data.episodes[0];
          if (!episode?.links.length) return fail({ noLinks: true });
          entry.value = { packageName: data.packageName, episode };
          return entry.value;
        },
        (error: unknown) =>
          fail({
            failure: describeApiError(error),
            retryable: retryable(error),
          }),
      ),
    };
    cache.set(key, entry);
    window.setTimeout(forget, EPISODE_LINKS_TTL);
    return entry.promise;
  }

  function copyEpisodeLinks(
    request: DownloadRequest,
    links: EpisodeLinks,
    provider?: DownloadProviderId,
  ) {
    if (!claimKey(requestKey(request))) return;
    const episode = provider
      ? {
          ...links.episode,
          links: links.episode.links.filter(
            (link) => link.provider === provider,
          ),
        }
      : links.episode;
    const activity = newActivity(request, preferencesRef.current.audio, {
      status: "ready",
      current: 1,
      packageName: links.packageName,
      episodes: [episode],
      destination: "COPY",
      isJob: false,
      provider,
    });
    replaceActivities([activity, ...activitiesRef.current]);
    // Synchronous up to the clipboard write: still inside the user's press.
    void deliver(activity.id);
  }

  function runAction(id: string, action: ActivityAction) {
    const activity = findIn(activitiesRef.current, id);
    if (!activity) return;
    switch (action) {
      case "cancel":
        return void cancelActivity(id);
      case "deliver":
        return void deliver(id);
      case "copy":
        return void copyActivityLinks(id);
      case "show-links":
        return showLinks(id);
      case "use-myjd":
      case "use-cnl":
        updateActivity(
          id,
          { destination: action === "use-myjd" ? "MYJD" : "CNL" },
          false,
        );
        return void deliver(id);
      case "choose-device":
        return requestDevice(id);
      case "retry":
        removeActivity(id);
        return void startOperation(activity.request, {
          idempotencyKey: activity.retryKey,
        });
      case "retry-failed":
        return void retryFailed(id);
      case "preferences":
        return openSettings();
    }
  }

  function reopenDismissed(id: string) {
    const activity = findIn(activitiesRef.current, id);
    if (activity?.status === "waiting-device") {
      setActivityDismissed(id, false);
      requestDevice(id);
    } else if (activity) surface(activity);
  }

  async function connect(email: string, password: string) {
    if (connecting) return;
    setDeviceError(null);
    setConnecting(true);
    try {
      setDevices(await connectMyJd(email, password));
      setMyJdConnected(true);
    } catch (error) {
      await dropMyJd(describeMyJdError(error));
    } finally {
      setConnecting(false);
    }
  }

  function sendDevice(deviceId: string) {
    const portable = deviceProfileRef.current === "portable";
    const { request } = panel;
    const activity = findIn(activitiesRef.current, panel.activityId);
    if (activity && !["waiting-device", "ready"].includes(activity.status))
      return;
    if (portable || request) rememberDevice(deviceId);
    if (request) {
      closeDrawer();
      void startOperation(request, {
        destination: "MYJD",
        preferredDeviceId: deviceId,
      });
      return;
    }
    if (!activity) {
      if (portable) closeDrawer();
      return;
    }
    closeDrawer();
    updateActivity(activity.id, { destination: "MYJD" }, false);
    void deliver(activity.id, deviceId);
  }

  function chooseAlternative(destination: "COPY" | "CNL") {
    const { request, activityId } = panel;
    if (request) {
      closeDrawer();
      void startOperation(request, { destination });
      return;
    }
    if (!activityId) return;
    updateActivity(activityId, { destination }, false);
    // Copy first (still inside the click) and let the result close it.
    if (destination === "COPY") return void copyActivityLinks(activityId);
    closeDrawer();
    void deliver(activityId);
  }

  async function resetMyJd() {
    await dropMyJd(null);
    rememberDevice(null);
  }

  // Browser-only state (device, MyJDownloader session, preferences) and the
  // jobs a reload interrupted.
  const restoreSession = useEffectEvent((profile: DeviceProfile) => {
    const session = webStorage("sessionStorage");
    setDeviceProfile(profile);
    setSelectedDeviceId(session?.getItem(selectedDeviceStorageKey) ?? null);
    setMyJdConnected(isMyJdConnected());
    const stored = storedPreferences();
    if (stored) savePreferences(stored);
    const restored = (session ? loadActiveDownloadJobs(session) : []).map(
      (job) =>
        newActivity(job.request, preferencesRef.current.audio, {
          id: job.id,
          status: "processing",
          current: job.current,
          total: job.total,
          receipt: job.receipt,
          destination: job.destination,
          createdAt: job.createdAt,
          isJob: true,
          restored: true,
          deliveryAttempted: job.deliveryAttempted,
          deliveryFailed: job.deliveryFailed,
        }),
    );
    if (!restored.length) return;
    replaceActivities(restored);
    for (const activity of restored) {
      publishActivity(activity);
      void pollJob(activity.id, activity.receipt as SavedJob, true);
    }
  });

  useLayoutEffect(() => {
    mountedRef.current = true;
    const profile = getDeviceProfile();
    document.documentElement.dataset.device = profile;
    let active = true;
    queueMicrotask(() => {
      if (active) restoreSession(profile);
    });
    const polls = pollsRef.current;
    const aborters = abortersRef.current;
    const toasts = toastIds.current;
    return () => {
      active = false;
      mountedRef.current = false;
      polls.forEach((poll) => window.clearTimeout(poll.timeout));
      polls.clear();
      aborters.forEach((controller) => controller.abort());
      aborters.clear();
      const open = [...toasts.values()];
      toasts.clear();
      open.forEach((toastId) => toast.close(toastId));
    };
  }, []);

  function getRequestStatus(request: DownloadRequest) {
    const key = requestKey(request);
    if (
      preferences.destination === "DESKTOP" &&
      remote.busy &&
      remote.download &&
      requestKey(remote.download) === key
    )
      return "sending";
    return activities.find((activity) => activity.key === key)?.status;
  }

  const portable = deviceProfile === "portable";
  const effectiveDestination = getEffectiveDestination(
    deviceProfile,
    preferences.destination,
  );
  const target = findIn(activities, panel.activityId);
  const targetRequest = panel.request ?? target?.request;
  const confirmation = confirmRequest &&
    effectiveDestination !== "COPY" && {
      request: confirmRequest,
      ...describeConfirmation(
        confirmRequest,
        effectiveDestination,
        preferences.providers,
      ),
    };

  return (
    <DownloadContext.Provider
      value={{
        openDownload,
        getRequestStatus,
        openSettings,
        preferences,
        deviceProfile,
        destination: effectiveDestination,
        desktopTargetLabel:
          effectiveDestination === "DESKTOP" ? remote.targetLabel : undefined,
        dockSlot,
        cachedEpisodeLinks,
        resolveEpisodeLinks,
        copyEpisodeLinks,
      }}
    >
      {children}
      <RemoteDownloadDrawer remote={remote} openPreferences={openSettings} />
      <DownloadDock
        onSlot={setDockSlot}
        pending={activities.filter(
          (activity) =>
            dismissedIds.has(activity.id) &&
            unfinishedStatuses.has(activity.status),
        )}
        portable={portable}
        onReopen={reopenDismissed}
        remotePending={
          remote.requests.some((r) => r.status === "pending") ? (
            <Button
              variant="secondary"
              className="pointer-events-auto"
              onPress={() =>
                remote.view(
                  remote.requests.find((r) => r.status === "pending")!.id,
                )
              }
            >
              Desktop · Pendiente de entrega
            </Button>
          ) : undefined
        }
      />
      {confirmation && (
        <AlertDialog.Backdrop
          isOpen={confirmDialog.isOpen}
          onOpenChange={confirmDialog.setOpen}
          isDismissable
          isKeyboardDismissDisabled={false}
        >
          <AlertDialog.Container size="sm">
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Icon status="accent">
                  <Download aria-hidden="true" />
                </AlertDialog.Icon>
                <AlertDialog.Heading>
                  {confirmation.heading}
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>{confirmation.body}</p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">
                  Cancelar
                </Button>
                <Button
                  slot="close"
                  onPress={() => dispatchDownload(confirmation.request)}
                >
                  Descargar
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      )}
      {drawerLoaded && (
        <DownloadDrawer
          state={drawer}
          title={
            panel.mode === "settings"
              ? "Preferencias de descarga"
              : panel.mode === "links"
                ? "Enlaces de descarga"
                : myJdConnected
                  ? "Elegir dispositivo"
                  : "Conectar MyJDownloader"
          }
          summary={
            targetRequest
              ? describeRequest(targetRequest) +
                (panel.mode === "links" && target
                  ? ` · ${describeLinks(deliverableEpisodes(target))}`
                  : "")
              : null
          }
          content={
            panel.mode === "settings"
              ? {
                  mode: "settings",
                  props: {
                    preferences,
                    savePreferences,
                    portable,
                    effectiveDestination,
                    selectedDeviceName:
                      devices.find((device) => device.id === selectedDeviceId)
                        ?.name ??
                      (selectedDeviceId ? "Dispositivo recordado" : null),
                    myJdConnected,
                    openDeviceSettings: () => showDevicePanel({}),
                    remote: {
                      ...remote,
                      view: (id) => {
                        closeDrawer();
                        remote.view(id);
                      },
                    },
                  },
                }
              : panel.mode === "links"
                ? {
                    mode: "links",
                    props: {
                      urls: target
                        ? collectUrls(deliverableEpisodes(target, "COPY"))
                        : [],
                      onCopied: () => target && markCopied(target.id),
                    },
                  }
                : {
                    mode: "devices",
                    props: {
                      portable,
                      connected: myJdConnected,
                      connecting,
                      devices,
                      devicesLoading,
                      deviceError,
                      hasTarget: Boolean(targetRequest),
                      deliveryPending: target?.status === "sending",
                      onConnect: (email, password) =>
                        void connect(email, password),
                      onRefresh: () => void refreshDevices(),
                      onReset: () => void resetMyJd(),
                      onSelectDevice: sendDevice,
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
  remotePending,
}: {
  onSlot: (element: HTMLElement | null) => void;
  pending: Activity[];
  portable: boolean;
  onReopen: (id: string) => void;
  remotePending?: ReactNode;
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
  const count = plural(
    pending.length,
    "descarga pendiente",
    "descargas pendientes",
  );
  return (
    <div
      ref={dockRef}
      role={occupied ? "region" : undefined}
      aria-label={occupied ? "Descargas y selección" : undefined}
      className="download-dock page-container pointer-events-none flex flex-col items-end gap-3"
    >
      {first && (
        <Button
          variant="secondary"
          className="pointer-events-auto max-w-full"
          onPress={() => onReopen(first.id)}
          aria-label={
            pending.length === 1
              ? `Mostrar descarga: ${describeRequest(first.request)}`
              : `Mostrar ${count}`
          }
        >
          <DockIcon activity={first} />
          <span className="min-w-0 truncate">
            {pending.length > 1 ? count : dockLabel(first, portable)}
          </span>
        </Button>
      )}
      {remotePending}
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
      >
        <ProgressCircle.Track>
          <ProgressCircle.TrackCircle />
          <ProgressCircle.FillCircle />
        </ProgressCircle.Track>
      </ProgressCircle>
    );
  }
  return <Download aria-hidden="true" />;
}
