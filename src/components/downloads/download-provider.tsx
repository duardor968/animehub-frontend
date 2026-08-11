"use client";

import { apiFetch } from "@/lib/api/client";
import { Button } from "@heroui/react";
import { Check, Clipboard, LoaderCircle, Send, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  connectMyJd,
  copyLinks,
  listMyJdDevices,
  providerLabels,
  sendToClickNLoad,
  sendToMyJd,
} from "./download-client";
import type {
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

interface DownloadContextValue {
  openDownload: (request: DownloadRequest) => void;
  openSettings: () => void;
  preferences: DownloadPreferences;
}

const defaults: DownloadPreferences = {
  audio: "SUB",
  providers: ["MEGA", "PIXELDRAIN", "MP4UPLOAD"],
  destination: "CNL",
  quickSend: false,
};

const DownloadContext = createContext<DownloadContextValue | null>(null);

export function useDownloads() {
  const value = useContext(DownloadContext);
  if (!value) throw new Error("DownloadProvider is missing.");
  return value;
}

export function DownloadProvider({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [preferences, setPreferences] = useState(defaults);
  const [request, setRequest] = useState<DownloadRequest | null>(null);
  const [settingsOnly, setSettingsOnly] = useState(false);
  const [stage, setStage] = useState<
    "review" | "working" | "ready" | "devices" | "sent" | "error"
  >("review");
  const [episodes, setEpisodes] = useState<ResolvedEpisode[]>([]);
  const [packageName, setPackageName] = useState("AnimeHub");
  const [message, setMessage] = useState("");
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [jobReceipt, setJobReceipt] = useState<SavedJob | null>(null);
  const [retryReceipt, setRetryReceipt] = useState<SavedJob | null>(null);
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const stored = localStorage.getItem("animehub.download-preferences");
      if (stored) {
        try {
          setPreferences({
            ...defaults,
            ...(JSON.parse(stored) as Partial<DownloadPreferences>),
          });
        } catch {
          localStorage.removeItem("animehub.download-preferences");
        }
      }
      const now = Date.now();
      const receipts = Object.keys(localStorage)
        .filter((key) => key.startsWith("animehub.download-job."))
        .flatMap((key) => {
          try {
            const value = JSON.parse(
              localStorage.getItem(key) ?? "",
            ) as SavedJob;
            if (
              !value.jobId ||
              !value.accessToken ||
              new Date(value.expiresAt).getTime() <= now
            ) {
              localStorage.removeItem(key);
              return [];
            }
            return [{ ...value, title: value.title || "Trabajo de descarga" }];
          } catch {
            localStorage.removeItem(key);
            return [];
          }
        });
      setSavedJobs(receipts);
    });
    return () => {
      active = false;
    };
  }, []);

  const savePreferences = useCallback((next: DownloadPreferences) => {
    setPreferences(next);
    localStorage.setItem("animehub.download-preferences", JSON.stringify(next));
  }, []);

  const resolveRequest = useCallback(
    async (current: DownloadRequest, sendImmediately = false) => {
      setStage("working");
      setMessage(
        current.all
          ? "Preparando todos los episodios…"
          : "Resolviendo espejos…",
      );
      try {
        const requiresJob =
          current.all ||
          (!current.episodeNumbers &&
            current.from !== undefined &&
            current.to !== undefined) ||
          (current.episodeNumbers?.length ?? 0) > 50;
        if (requiresJob) {
          const receipt = await apiFetch<{
            data: { jobId: string; accessToken: string; expiresAt: string };
          }>(
            `/anime/${encodeURIComponent(current.slug)}/download-jobs`,
            {
              method: "POST",
              body: JSON.stringify({
                scope: current.all ? "ALL" : "RANGE",
                from: current.from,
                to: current.to,
                audio: preferences.audio,
                providers: preferences.providers,
              }),
            },
            true,
          );
          const value = receipt.data;
          const saved = { ...value, title: current.title };
          localStorage.setItem(
            `animehub.download-job.${value.jobId}`,
            JSON.stringify(saved),
          );
          setSavedJobs((jobs) => [
            saved,
            ...jobs.filter((job) => job.jobId !== saved.jobId),
          ]);
          setJobReceipt(saved);
          return;
        }
        const response = await apiFetch<{
          data: { packageName: string; episodes: ResolvedEpisode[] };
        }>(
          `/anime/${encodeURIComponent(current.slug)}/downloads/resolve`,
          {
            method: "POST",
            body: JSON.stringify({
              episodeNumbers: current.episodeNumbers,
              audio: preferences.audio,
              providers: preferences.providers,
            }),
          },
          true,
        );
        const resolvedUrls = response.data.episodes.flatMap((episode) =>
          episode.links.map((link) => link.url),
        );
        setPackageName(response.data.packageName);
        setEpisodes(response.data.episodes);
        if (sendImmediately) {
          if (resolvedUrls.length === 0) {
            setMessage("No hay enlaces compatibles para enviar.");
            setStage("error");
          } else if (preferences.destination === "CNL") {
            sendToClickNLoad(response.data.packageName, resolvedUrls);
            setMessage(
              "Enlaces enviados a LinkGrabber. Si no reaccionó, usa MyJD o copia los enlaces.",
            );
            setStage("sent");
          } else {
            const available = await listMyJdDevices();
            setDevices(available.map(({ id, name }) => ({ id, name })));
            setStage("devices");
          }
          return;
        }
        setStage("ready");
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "No se pudo resolver la descarga.",
        );
        setStage("error");
      }
    },
    [preferences],
  );

  useEffect(() => {
    if (!jobReceipt) return;
    let cancelled = false;
    const poll = async () => {
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
          `/download-jobs/${jobReceipt.jobId}`,
          { headers: { authorization: `Bearer ${jobReceipt.accessToken}` } },
          true,
        );
        if (cancelled) return;
        const job = response.data;
        setMessage(
          `${job.completedItems + job.failedItems} de ${job.totalItems} episodios procesados`,
        );
        if (
          ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"].includes(job.status)
        ) {
          setPackageName(job.packageName);
          setEpisodes(job.episodes);
          setStage(
            job.episodes.some((entry) => entry.links.length)
              ? "ready"
              : "error",
          );
          setRetryReceipt(job.failedItems > 0 ? jobReceipt : null);
          setJobReceipt(null);
          return;
        }
        window.setTimeout(poll, 1_500);
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : "No se pudo consultar el trabajo.",
          );
          setStage("error");
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [jobReceipt]);

  const urls = useMemo(
    () => episodes.flatMap((episode) => episode.links.map((link) => link.url)),
    [episodes],
  );

  const chooseDestination = useCallback(async () => {
    if (urls.length === 0) {
      setMessage("No hay enlaces compatibles para enviar.");
      setStage("error");
      return;
    }
    if (preferences.destination === "CNL") {
      sendToClickNLoad(packageName, urls);
      setMessage(
        "Enlaces enviados a LinkGrabber. Si no reaccionó, usa MyJD o copia los enlaces.",
      );
      setStage("sent");
      return;
    }
    const available = await listMyJdDevices();
    setDevices(available.map(({ id, name }) => ({ id, name })));
    setStage("devices");
  }, [packageName, preferences.destination, urls]);

  const openDownload = useCallback(
    (next: DownloadRequest) => {
      setRequest(next);
      setSettingsOnly(false);
      setEpisodes([]);
      setMessage("");
      setJobReceipt(null);
      setRetryReceipt(null);
      setStage("review");
      dialog.current?.showModal();
      if (preferences.quickSend && next.episodeNumbers?.length === 1) {
        void resolveRequest(next, true);
      }
    },
    [preferences.quickSend, resolveRequest],
  );

  const openSettings = useCallback(() => {
    setSettingsOnly(true);
    setRequest(null);
    setStage("review");
    dialog.current?.showModal();
  }, []);

  const recoverJob = useCallback((saved: SavedJob) => {
    setSettingsOnly(false);
    setRequest(null);
    setPackageName(saved.title);
    setEpisodes([]);
    setMessage("Recuperando el trabajo…");
    setStage("working");
    setJobReceipt(saved);
    dialog.current?.showModal();
  }, []);

  async function cancelJob() {
    if (!jobReceipt) return;
    try {
      const response = await apiFetch<{
        data: { packageName: string; episodes: ResolvedEpisode[] };
      }>(
        `/download-jobs/${jobReceipt.jobId}/cancel`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${jobReceipt.accessToken}` },
        },
        true,
      );
      setPackageName(response.data.packageName);
      setEpisodes(response.data.episodes);
      setMessage(
        "Trabajo cancelado. Los resultados ya resueltos siguen disponibles.",
      );
      setStage(
        response.data.episodes.some((entry) => entry.links.length)
          ? "ready"
          : "error",
      );
      setJobReceipt(null);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo cancelar el trabajo.",
      );
      setStage("error");
    }
  }

  async function retryFailed() {
    if (!retryReceipt) return;
    setStage("working");
    setMessage("Reintentando únicamente los episodios fallidos…");
    try {
      await apiFetch(
        `/download-jobs/${retryReceipt.jobId}/retry`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${retryReceipt.accessToken}` },
        },
        true,
      );
      setJobReceipt(retryReceipt);
      setRetryReceipt(null);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo reintentar el trabajo.",
      );
      setStage("error");
    }
  }

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    setStage("working");
    setMessage("Conectando con MyJDownloader…");
    try {
      const available = await connectMyJd(email, password);
      setPassword("");
      setDevices(available.map(({ id, name }) => ({ id, name })));
      setStage("devices");
    } catch (error) {
      setPassword("");
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo conectar con MyJDownloader.",
      );
      setStage("error");
    }
  }

  async function sendDevice(deviceId: string) {
    setStage("working");
    setMessage("Enviando a LinkGrabber…");
    try {
      await sendToMyJd(deviceId, packageName, urls);
      setMessage("Enlaces añadidos a LinkGrabber.");
      setStage("sent");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo enviar a MyJDownloader.",
      );
      setStage("error");
    }
  }

  function toggleProvider(provider: DownloadProviderId) {
    const included = preferences.providers.includes(provider);
    const providers = included
      ? preferences.providers.filter((entry) => entry !== provider)
      : [...preferences.providers, provider];
    if (providers.length > 0) savePreferences({ ...preferences, providers });
  }

  return (
    <DownloadContext.Provider
      value={{ openDownload, openSettings, preferences }}
    >
      {children}
      <dialog
        className="download-dialog"
        ref={dialog}
        onClose={() => setPassword("")}
      >
        <div className="dialog-topline">
          <div>
            <span className="eyebrow">Descargas</span>
            <h2>
              {settingsOnly ? "Preferencias" : (request?.title ?? packageName)}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={() => dialog.current?.close()}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {stage === "review" && (
          <div className="download-review">
            {!settingsOnly && (
              <p className="dialog-summary">
                {request?.all
                  ? "Serie completa. La resolución continuará aunque cierres esta pestaña."
                  : request?.from !== undefined && request?.to !== undefined
                    ? `Episodios ${request.from}–${request.to}. Los rangos extensos continuarán aunque cierres esta pestaña.`
                    : `${request?.episodeNumbers?.length ?? 0} episodio${request?.episodeNumbers?.length === 1 ? "" : "s"} seleccionado${request?.episodeNumbers?.length === 1 ? "" : "s"}.`}
              </p>
            )}
            <fieldset>
              <legend>Audio preferido</legend>
              <div className="choice-row">
                {(["SUB", "DUB"] as const).map((audio) => (
                  <button
                    className={
                      preferences.audio === audio ? "choice active" : "choice"
                    }
                    key={audio}
                    onClick={() => savePreferences({ ...preferences, audio })}
                  >
                    {audio}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Espejos</legend>
              <div className="provider-list">
                {(Object.keys(providerLabels) as DownloadProviderId[]).map(
                  (provider) => (
                    <label key={provider}>
                      <input
                        type="checkbox"
                        checked={preferences.providers.includes(provider)}
                        onChange={() => toggleProvider(provider)}
                      />
                      <span>{providerLabels[provider]}</span>
                    </label>
                  ),
                )}
              </div>
            </fieldset>
            <fieldset>
              <legend>Destino</legend>
              <div className="choice-row destination-row">
                <button
                  className={
                    preferences.destination === "CNL"
                      ? "choice active"
                      : "choice"
                  }
                  onClick={() =>
                    savePreferences({ ...preferences, destination: "CNL" })
                  }
                >
                  Click&apos;n&apos;Load
                </button>
                <button
                  className={
                    preferences.destination === "MYJD"
                      ? "choice active"
                      : "choice"
                  }
                  onClick={() =>
                    savePreferences({ ...preferences, destination: "MYJD" })
                  }
                >
                  MyJDownloader
                </button>
              </div>
            </fieldset>
            <label className="quick-toggle">
              <input
                type="checkbox"
                checked={preferences.quickSend}
                onChange={(event) =>
                  savePreferences({
                    ...preferences,
                    quickSend: event.target.checked,
                  })
                }
              />
              <span>
                <strong>Envío rápido</strong>
                <small>Usa estas preferencias al pulsar un episodio.</small>
              </span>
            </label>
            {settingsOnly && savedJobs.length > 0 && (
              <fieldset>
                <legend>Trabajos recientes</legend>
                <div className="recent-jobs">
                  {savedJobs.map((saved) => (
                    <button key={saved.jobId} onClick={() => recoverJob(saved)}>
                      <span>{saved.title}</span>
                      <small>Recuperar progreso</small>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            {!settingsOnly && request && (
              <Button
                className="primary-button full-button"
                onPress={() => void resolveRequest(request)}
              >
                Preparar enlaces
              </Button>
            )}
          </div>
        )}

        {stage === "working" && (
          <div className="dialog-status" aria-live="polite">
            <LoaderCircle className="spin" size={26} />
            <p>{message}</p>
            {jobReceipt && (
              <button
                className="secondary-button full-button"
                onClick={() => void cancelJob()}
              >
                Cancelar trabajo
              </button>
            )}
          </div>
        )}

        {stage === "ready" && (
          <div className="dialog-status">
            <Check size={28} />
            <p>
              {urls.length} enlaces preparados en {episodes.length} episodios.
            </p>
            {episodes.some((episode) => episode.errorCode) && (
              <span className="status-note">
                Los episodios sin enlace quedaron fuera; puedes reintentarlos
                desde el trabajo.
              </span>
            )}
            {retryReceipt && (
              <button
                className="secondary-button full-button"
                onClick={() => void retryFailed()}
              >
                Reintentar fallidos
              </button>
            )}
            <button
              className="primary-button full-button"
              onClick={() => void chooseDestination()}
            >
              <Send size={16} /> Enviar a{" "}
              {preferences.destination === "CNL"
                ? "Click'n'Load"
                : "MyJDownloader"}
            </button>
          </div>
        )}

        {stage === "devices" && (
          <div className="device-stage">
            {devices.length > 0 ? (
              <>
                <p>Elige el dispositivo para esta operación.</p>
                {devices.map((device) => (
                  <button
                    className="device-row"
                    key={device.id}
                    onClick={() => void sendDevice(device.id)}
                  >
                    <span>{device.name}</span>
                    <Send size={16} />
                  </button>
                ))}
              </>
            ) : (
              <form className="myjd-form" onSubmit={connect}>
                <p>
                  Conecta tu cuenta. La contraseña se descarta al crear la
                  sesión.
                </p>
                <label>
                  Correo
                  <input
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
                <label>
                  Contraseña
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <button className="primary-button full-button" type="submit">
                  Conectar
                </button>
              </form>
            )}
          </div>
        )}

        {(stage === "sent" || stage === "error") && (
          <div className="dialog-status" aria-live="polite">
            {stage === "sent" ? <Check size={28} /> : <X size={28} />}
            <p>{message}</p>
            {urls.length > 0 && (
              <button
                className="secondary-button full-button"
                onClick={() => void copyLinks(urls)}
              >
                <Clipboard size={16} /> Copiar enlaces
              </button>
            )}
            {stage === "error" && request && (
              <button
                className="primary-button full-button"
                onClick={() => void resolveRequest(request)}
              >
                Reintentar
              </button>
            )}
          </div>
        )}
      </dialog>
    </DownloadContext.Provider>
  );
}
