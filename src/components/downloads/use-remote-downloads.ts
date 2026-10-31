"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { ApiResponseError } from "@/lib/api/client";
import {
  hasRemoteSession,
  remoteClient,
  remoteEpisodeNumbers,
  remoteTarget,
  remoteStatus,
  requestLabel,
  type RemoteDevice,
  type RemoteRequest,
  type RemoteRequestInput,
} from "./remote-client";
import type { DownloadRequest } from "./download-types";

const preferenceKey = "animehub.remote.preferred.v1";
/** The PC the selection bar names ({ id, name }), so a reload shows it
 *  without asking the API. */
const targetKey = "animehub.remote.target.v2";
/** v1 also held labels of the UI ("Elegir PC") as if they were a PC. */
const legacyTargetKey = "animehub.remote.target.v1";

type StoredTarget = { id: string; name: string };

function parseTarget(raw: string | null): StoredTarget | null {
  try {
    const value = JSON.parse(raw ?? "null") as Partial<StoredTarget> | null;
    return typeof value?.id === "string" && typeof value.name === "string"
      ? { id: value.id, name: value.name }
      : null;
  } catch {
    return null;
  }
}

/** The preference as stored now: another tab may have changed it. Null when
 *  the browser blocks storage. */
function storedPreference(): string | null {
  try {
    return localStorage.getItem(preferenceKey) ?? "";
  } catch {
    return null;
  }
}

export function useRemoteDownloads(settingsOpen: boolean) {
  const [devices, setDevices] = useState<RemoteDevice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [requests, setRequests] = useState<RemoteRequest[]>([]);
  const [preferred, setPreferred] = useState("");
  const [storedTarget, setStoredTarget] = useState<StoredTarget | null>(null);
  const [chosenDeviceId, setChosenDeviceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorScope, setErrorScope] = useState<"settings" | "request">(
    "settings",
  );
  const [profileRetry, setProfileRetry] = useState<string | null>(null);
  const [panel, setPanel] = useState<"choose" | "request" | "requests" | null>(
    null,
  );
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [download, setDownload] = useState<DownloadRequest | null>(null);
  const operation = useRef(false);
  const retry = useRef<{
    body: RemoteRequestInput;
    key: string;
    deviceName: string;
    offline: boolean;
  } | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  // The toast of the last request sent, while the PC has yet to take it.
  const sent = useRef<{
    toastId: string;
    requestId: string;
    deviceName: string;
  } | null>(null);
  const mounted = useRef(true);
  const refreshVersion = useRef(0);

  useEffect(() => {
    mounted.current = true;
    queueMicrotask(() => {
      if (!mounted.current) return;
      try {
        setPreferred(storedPreference() ?? "");
        localStorage.removeItem(legacyTargetKey);
        if (hasRemoteSession())
          setStoredTarget(parseTarget(localStorage.getItem(targetKey)));
      } catch {
        /* Browser privacy mode. */
      }
    });
    // A change made in another tab applies here too.
    const onStorage = (event: StorageEvent) => {
      if (event.key === preferenceKey || event.key === null)
        setPreferred(storedPreference() ?? "");
      if (event.key === targetKey || event.key === null)
        setStoredTarget(parseTarget(event.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => {
      mounted.current = false;
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  function choosePreferred(id: string) {
    setPreferred(id);
    try {
      localStorage.setItem(preferenceKey, id);
    } catch {
      /* Live preference still applies. */
    }
  }
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    if (!hasRemoteSession()) {
      setDevices([]);
      setRequests([]);
      setLoaded(true);
      return [];
    }
    const [linked, recent] = await Promise.all([
      remoteClient.devices(),
      remoteClient.requests(),
    ]);
    if (mounted.current && version === refreshVersion.current) {
      setDevices(linked.devices);
      setRequests(recent.requests);
      setLoaded(true);
    }
    return linked.devices;
  }, []);
  const report = useCallback(
    (cause: unknown, scope: "settings" | "request" = "settings") => {
      if (!mounted.current) return;
      setErrorScope(scope);
      if (cause instanceof ApiResponseError && cause.status === 401) {
        setDevices([]);
        setRequests([]);
        setLoaded(true);
        setError(
          "La vinculación de este navegador caducó. Vuelve a vincular el PC.",
        );
      } else
        setError(
          cause instanceof ApiResponseError
            ? cause.message
            : "No se pudo contactar con AnimeHub. Inténtalo de nuevo.",
        );
    },
    [],
  );
  // The toast says what the PC did as soon as the requests read again say so.
  useEffect(() => {
    const shown = sent.current;
    const request = shown && requests.find((r) => r.id === shown.requestId);
    if (!shown || !request || request.status === "pending") return;
    sent.current = null;
    toast.update(shown.toastId, remoteStatus(request, shown.deviceName), {
      description: requestLabel(request),
      timeout: 5000,
    });
  }, [requests]);
  const pending = requests.some((r) => r.status === "pending");
  const linked = devices.length > 0;
  useEffect(() => {
    if (!settingsOpen && !pending) return;
    let active = true;
    // The API announces each change on the live channel; a look every 5 s
    // stands in only while it is closed.
    let live = false;
    let timer: ReturnType<typeof setTimeout>;
    let reconnect: ReturnType<typeof setTimeout>;
    const channel = new AbortController();
    async function poll() {
      clearTimeout(timer);
      try {
        await refresh();
        if (active && !live) timer = setTimeout(poll, 5000);
      } catch (cause) {
        report(cause);
        // A dropped connection tries again; an expired link has nothing left to poll.
        const expired =
          cause instanceof ApiResponseError && cause.status === 401;
        if (active && !expired && !live) timer = setTimeout(poll, 5000);
      }
    }
    async function listen(failures: number) {
      let opened = false;
      try {
        await remoteClient.events(
          {
            open: () => {
              opened = live = true;
              void poll();
            },
            change: () => void poll(),
          },
          channel.signal,
        );
      } catch (cause) {
        if (cause instanceof ApiResponseError && cause.status === 401) {
          if (active) report(cause);
          return;
        }
      }
      live = false;
      if (!active) return;
      void poll();
      const next = opened ? 0 : failures + 1;
      reconnect = setTimeout(
        () => void listen(next),
        Math.min(30000, 1000 * 2 ** next),
      );
    }
    if (linked) void listen(0);
    else void poll();
    return () => {
      active = false;
      channel.abort();
      clearTimeout(timer);
      clearTimeout(reconnect);
    };
  }, [settingsOpen, pending, linked, refresh, report]);
  // The PC the selection bar names, remembered for the next reload.
  const live = loaded ? remoteTarget(devices, preferred) : undefined;
  const liveTarget = live
    ? JSON.stringify({ id: live.id, name: live.name })
    : "";
  useEffect(() => {
    if (!loaded) return;
    try {
      if (liveTarget) localStorage.setItem(targetKey, liveTarget);
      else localStorage.removeItem(targetKey);
    } catch {
      /* The live name still applies. */
    }
  }, [loaded, liveTarget]);

  async function run(
    action: () => Promise<void>,
    scope: "settings" | "request" = "settings",
  ) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      report(cause, scope);
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function deliver(request: DownloadRequest, device: RemoteDevice) {
    const profile = device.profiles.find((p) => p.isDefault);
    if (!profile) {
      setProfileRetry(device.id);
      throw new ApiResponseError(
        409,
        `En ${device.name}, abre AnimeHub para PC → Ajustes → Descargas y configura un perfil predeterminado.`,
      );
    }
    setProfileRetry(null);
    const episodeNumbers = await remoteEpisodeNumbers(request);
    if (!episodeNumbers.length)
      throw new ApiResponseError(400, "No hay episodios en esta selección.");
    const body: RemoteRequestInput = {
      deviceId: device.id,
      animeSlug: request.slug,
      episodeNumbers,
      profileId: profile.id,
      profileRevision: device.profileRevision,
      engine: profile.engine,
    };
    retry.current = {
      body,
      key: crypto.randomUUID(),
      deviceName: device.name,
      offline: !device.online,
    };
    await submitPinned();
  }
  async function submitPinned() {
    const attempt = retry.current;
    if (!attempt) return;
    setCanRetry(true);
    let result: RemoteRequest;
    try {
      result = await remoteClient.create(attempt.body, attempt.key);
    } catch (cause) {
      if (
        cause instanceof ApiResponseError &&
        cause.status < 500 &&
        cause.status !== 429
      ) {
        retry.current = null;
        setCanRetry(false);
      }
      setPanel("request");
      throw cause;
    }
    retry.current = null;
    setCanRetry(false);
    ++refreshVersion.current;
    setRequests((old) => [result, ...old.filter((r) => r.id !== result.id)]);
    setSelectedRequest(result.id);
    setPanel(null);
    const name = attempt.deviceName;
    // Titled with the request's state, as the panel words it; the toast
    // follows it while the PC has yet to take it.
    const toastId = toast(remoteStatus(result, name, attempt.offline), {
      description: requestLabel(result),
      timeout: 5000,
    });
    sent.current =
      result.status === "pending"
        ? { toastId, requestId: result.id, deviceName: name }
        : null;
  }
  function start(request: DownloadRequest, needDestination: () => void) {
    void run(async () => {
      retry.current = null;
      setCanRetry(false);
      setProfileRetry(null);
      setDownload(request);
      const linked = await refresh();
      if (!linked.length) {
        needDestination();
        return;
      }
      const target = remoteTarget(linked, storedPreference() ?? preferred);
      if (!target) {
        setChosenDeviceId("");
        setPanel("choose");
        return;
      }
      setSelectedRequest(null);
      try {
        await deliver(request, target);
      } catch (cause) {
        setPanel("request");
        throw cause;
      }
    }, "request");
  }
  return {
    devices,
    loaded,
    requests,
    preferred,
    /** The PC a download goes to, if one is set. */
    target: loaded
      ? live
        ? { id: live.id, name: live.name }
        : null
      : storedTarget,
    chosenDeviceId,
    setChosenDeviceId,
    choosePreferred,
    busy,
    error,
    errorScope,
    profileRetry,
    clearError: () => setError(null),
    panel,
    setPanel,
    selectedRequest,
    download,
    canRetry,
    start,
    refresh: () =>
      void run(async () => {
        await refresh();
      }),
    link: (code: string, done: () => void) =>
      void run(async () => {
        const result = await remoteClient.link(code);
        const linked = await refresh();
        if (!preferred && linked.length === 1) choosePreferred(result.deviceId);
        done();
      }),
    unlink: (id: string, done: () => void) =>
      void run(async () => {
        await remoteClient.unlink(id);
        await refresh();
        done();
      }),
    cancel: (id: string) =>
      void run(async () => {
        try {
          await remoteClient.cancel(id);
        } finally {
          await refresh();
        }
      }, "request"),
    choose: (deviceId: string) =>
      void run(async () => {
        const device = devices.find((d) => d.id === deviceId);
        if (device && download) {
          setSelectedRequest(null);
          try {
            await deliver(download, device);
          } catch (cause) {
            setPanel("request");
            throw cause;
          }
        }
      }, "request"),
    retry: () => void run(submitPinned, "request"),
    retryProfile: () =>
      void run(async () => {
        if (!download || !profileRetry) return;
        const linked = await refresh();
        const device = linked.find((item) => item.id === profileRetry);
        if (!device)
          throw new ApiResponseError(
            404,
            "El PC ya no está vinculado. Elige otro destino de descarga.",
          );
        await deliver(download, device);
      }, "request"),
    view: (id: string) => {
      setError(null);
      setSelectedRequest(id);
      setPanel("request");
    },
    list: () => {
      setError(null);
      setPanel("requests");
    },
  };
}
export type RemoteDownloads = ReturnType<typeof useRemoteDownloads>;
