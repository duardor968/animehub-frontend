import { ClickNLoadError, MyJdDeviceError } from "./download-errors";
import type { DownloadProviderId } from "./download-types";

let myJdClient: Awaited<
  ReturnType<(typeof import("jdownloader-connect"))["default"]>
> | null = null;

// jdownloader-connect serializes calls through an internal promise that it
// never awaits, so every failed call also surfaces as an unhandled rejection
// of the same Error. Errors we already handled are muted here.
const handledMyJdErrors = new WeakSet<object>();
let rejectionGuardInstalled = false;

function installRejectionGuard() {
  if (rejectionGuardInstalled || typeof window === "undefined") return;
  rejectionGuardInstalled = true;
  window.addEventListener("unhandledrejection", (event) => {
    const reason: unknown = event.reason;
    if (typeof reason === "object" && reason && handledMyJdErrors.has(reason))
      event.preventDefault();
  });
}

async function guardMyJd<T>(operation: () => Promise<T>): Promise<T> {
  installRejectionGuard();
  try {
    return await operation();
  } catch (error) {
    if (typeof error === "object" && error) handledMyJdErrors.add(error);
    throw error;
  }
}

export async function connectMyJd(email: string, password: string) {
  return guardMyJd(async () => {
    const { default: connect } = await import("jdownloader-connect");
    myJdClient = await connect({ email, password, appKey: "animehub-webui" });
    try {
      sessionStorage.setItem(
        "animehub.myjd.session",
        JSON.stringify({ active: true, createdAt: new Date().toISOString() }),
      );
    } catch {
      // The session marker is informational only.
    }
    return myJdClient.listDevices();
  });
}

export async function listMyJdDevices() {
  const client = myJdClient;
  if (!client) return [];
  return guardMyJd(() => client.listDevices());
}

export function isMyJdConnected() {
  return myJdClient !== null;
}

export async function sendToMyJd(
  deviceId: string,
  packageName: string,
  urls: string[],
) {
  const client = myJdClient;
  if (!client)
    throw new MyJdDeviceError("Conecta MyJDownloader para continuar.");
  await guardMyJd(async () => {
    const devices = await client.listDevices();
    const device = devices.find((entry) => entry.id === deviceId);
    if (!device)
      throw new MyJdDeviceError(
        "El dispositivo ya no está disponible. Abre JDownloader en ese equipo o elige otro.",
      );
    await device.linkGrabberAddLinks({
      links: urls.join("\n"),
      packageName,
      autostart: false,
    });
  });
}

export async function disconnectMyJd() {
  const client = myJdClient;
  myJdClient = null;
  try {
    sessionStorage.removeItem("animehub.myjd.session");
  } catch {
    // Ignore blocked storage.
  }
  if (client) await guardMyJd(() => client.disconnect());
}

const clickNLoadBase = "http://127.0.0.1:9666/flash";

function isTimeout(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

/**
 * Sends links to the local JDownloader through Click'n'Load. Failures are
 * thrown as ClickNLoadError so the UI can tell "JDownloader isn't open"
 * (nothing was sent, retry is safe) from "sent but unconfirmed".
 */
export async function sendToClickNLoad(packageName: string, urls: string[]) {
  const signal = AbortSignal.timeout(8_000);
  let health: Response;
  try {
    health = await fetch(`${clickNLoadBase}/`, { cache: "no-store", signal });
  } catch (error) {
    throw new ClickNLoadError(isTimeout(error) ? "timeout" : "unreachable");
  }
  let identity = "";
  try {
    identity = await health.text();
  } catch {
    // An unreadable body is treated like a foreign service below.
  }
  if (!health.ok || !identity.toLowerCase().includes("jdownloader"))
    throw new ClickNLoadError("identity");

  const body = new URLSearchParams({
    urls: urls.join("\n"),
    package: packageName,
    source: window.location.href,
  });
  let response: Response;
  try {
    response = await fetch(`${clickNLoadBase}/add`, {
      method: "POST",
      body,
      cache: "no-store",
      signal,
    });
  } catch {
    throw new ClickNLoadError("uncertain");
  }
  if (!response.ok) throw new ClickNLoadError("rejected");
  return { acceptedAt: new Date().toISOString() };
}

/**
 * Copies links to the clipboard. Falls back to a hidden textarea and
 * execCommand for browsers that block the async clipboard (e.g. Safari
 * outside a user gesture). Returns false when both are blocked so the UI can
 * show the links for manual copying.
 */
export async function copyLinks(urls: string[]): Promise<boolean> {
  const text = urls.join("\n");
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const active = document.activeElement as HTMLElement | null;
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.inset = "0 auto auto 0";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    active?.focus?.({ preventScroll: true });
    return copied;
  } catch {
    return false;
  }
}

export const providerLabels: Record<DownloadProviderId, string> = {
  MEGA: "Mega",
  PIXELDRAIN: "Pixeldrain",
  MP4UPLOAD: "MP4Upload",
  ONE_FICHIER: "1Fichier",
};
