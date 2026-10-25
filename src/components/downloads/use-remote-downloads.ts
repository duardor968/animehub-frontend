"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { ApiResponseError } from "@/lib/api/client";
import {
  hasRemoteSession,
  remoteClient,
  remoteEpisodeNumbers,
  remoteTarget,
  remoteOnline,
  type RemoteDevice,
  type RemoteRequest,
  type RemoteRequestInput,
} from "./remote-client";
import type { DownloadRequest } from "./download-types";

const preferenceKey = "animehub.remote.preferred.v1";
const targetKey = "animehub.remote.target.v1";
export function useRemoteDownloads(settingsOpen: boolean) {
  const [devices, setDevices] = useState<RemoteDevice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [requests, setRequests] = useState<RemoteRequest[]>([]);
  const [preferred, setPreferred] = useState("");
  const [storedTarget, setStoredTarget] = useState("");
  const [chosenDeviceId, setChosenDeviceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorScope, setErrorScope] = useState<"settings" | "request">(
    "settings",
  );
  const [profileRetry, setProfileRetry] = useState<string | null>(null);
  const [panel, setPanel] = useState<"choose" | "request" | null>(null);
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
  const mounted = useRef(true);
  const refreshVersion = useRef(0);

  useEffect(() => {
    mounted.current = true;
    queueMicrotask(() => {
      if (!mounted.current) return;
      try {
        setPreferred(localStorage.getItem(preferenceKey) ?? "");
        if (hasRemoteSession())
          setStoredTarget(localStorage.getItem(targetKey) ?? "");
      } catch {
        /* Browser privacy mode. */
      }
    });
    return () => {
      mounted.current = false;
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
  const pending = requests.some((r) => r.status === "pending");
  useEffect(() => {
    if (!settingsOpen && !pending) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        await refresh();
        if (active) timer = setTimeout(poll, 5000);
      } catch (cause) {
        report(cause);
        // A dropped connection tries again; an expired link has nothing left to poll.
        const expired =
          cause instanceof ApiResponseError && cause.status === 401;
        if (active && !expired) timer = setTimeout(poll, 5000);
      }
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [settingsOpen, pending, refresh, report]);
  // The PC the selection bar names. It is remembered so that a reload shows it without asking the API.
  const liveTarget = loaded
    ? (remoteTarget(devices, preferred)?.name ??
      (devices.length && preferred === "ask"
        ? "Preguntar cada vez"
        : "Elegir PC"))
    : null;
  useEffect(() => {
    if (!liveTarget) return;
    try {
      localStorage.setItem(targetKey, liveTarget);
    } catch {
      /* The live name still applies. */
    }
  }, [liveTarget]);

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
        `En ${device.name}, abre AnimeHub Desktop → Ajustes → Descargas y configura un perfil predeterminado.`,
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
      offline: !remoteOnline(device),
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
    toast("Solicitud enviada", {
      description:
        result.status === "accepted"
          ? `Recibida por ${name} · En cola`
          : `Pendiente de entrega · ${name}${attempt.offline ? " sin conexión" : ""}`,
      timeout: 5000,
    });
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
      const target = remoteTarget(linked, preferred);
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
    targetLabel: liveTarget ?? (storedTarget || "Elegir PC"),
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
  };
}
export type RemoteDownloads = ReturnType<typeof useRemoteDownloads>;
