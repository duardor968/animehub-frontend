import type { DownloadProviderId } from "./download-types";

let myJdClient: Awaited<
  ReturnType<(typeof import("jdownloader-connect"))["default"]>
> | null = null;

export async function connectMyJd(email: string, password: string) {
  const { default: connect } = await import("jdownloader-connect");
  myJdClient = await connect({ email, password, appKey: "animehub-webui" });
  sessionStorage.setItem(
    "animehub.myjd.session",
    JSON.stringify({ active: true, createdAt: new Date().toISOString() }),
  );
  return myJdClient.listDevices();
}

export async function listMyJdDevices() {
  if (!myJdClient) return [];
  return myJdClient.listDevices();
}

export function isMyJdConnected() {
  return myJdClient !== null;
}

export async function sendToMyJd(
  deviceId: string,
  packageName: string,
  urls: string[],
) {
  if (!myJdClient) throw new Error("Conecta MyJDownloader para continuar.");
  const devices = await myJdClient.listDevices();
  const device = devices.find((entry) => entry.id === deviceId);
  if (!device) throw new Error("El dispositivo ya no está disponible.");
  await device.linkGrabberAddLinks({
    links: urls.join("\n"),
    packageName,
    autostart: false,
  });
}

export async function disconnectMyJd() {
  const client = myJdClient;
  myJdClient = null;
  sessionStorage.removeItem("animehub.myjd.session");
  await client?.disconnect();
}

const clickNLoadBase = "http://127.0.0.1:9666/flash";

export async function sendToClickNLoad(packageName: string, urls: string[]) {
  const signal = AbortSignal.timeout(8_000);
  try {
    const health = await fetch(`${clickNLoadBase}/`, {
      cache: "no-store",
      signal,
    });
    const identity = await health.text();
    if (!health.ok || !identity.toLowerCase().includes("jdownloader")) {
      throw new Error(
        "El servicio local respondió con una identidad inesperada.",
      );
    }

    const body = new URLSearchParams({
      urls: urls.join("\n"),
      package: packageName,
      source: window.location.href,
    });
    const response = await fetch(`${clickNLoadBase}/add`, {
      method: "POST",
      body,
      cache: "no-store",
      signal,
    });
    if (!response.ok) {
      throw new Error(`Click'n'Load respondió con HTTP ${response.status}.`);
    }
    return { acceptedAt: new Date().toISOString() };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new Error(
        "JDownloader no respondió en 8 segundos. Comprueba que esté abierto y que Click'n'Load esté activo.",
      );
    }
    throw new Error(
      error instanceof Error
        ? `JDownloader no aceptó la solicitud: ${error.message}`
        : "JDownloader no aceptó la solicitud local.",
    );
  }
}

export async function copyLinks(urls: string[]) {
  await navigator.clipboard.writeText(urls.join("\n"));
}

export const providerLabels: Record<DownloadProviderId, string> = {
  MEGA: "Mega",
  PIXELDRAIN: "Pixeldrain",
  MP4UPLOAD: "MP4Upload",
  ONE_FICHIER: "1Fichier",
};
