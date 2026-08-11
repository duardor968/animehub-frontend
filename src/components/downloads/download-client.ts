import type { DownloadProviderId } from "./download-types";

let myJdClient: Awaited<
  ReturnType<(typeof import("jdownloader-connect"))["default"]>
> | null = null;

export async function connectMyJd(email: string, password: string) {
  const { default: connect } = await import("jdownloader-connect");
  myJdClient = await connect({ email, password, appKey: "animehub-webui" });
  sessionStorage.setItem("animehub.myjd.session", "active");
  return myJdClient.listDevices();
}

export async function listMyJdDevices() {
  if (!myJdClient) return [];
  return myJdClient.listDevices();
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
  await myJdClient?.disconnect();
  myJdClient = null;
  sessionStorage.removeItem("animehub.myjd.session");
}

export function sendToClickNLoad(packageName: string, urls: string[]) {
  const frameName = `animehub-cnl-${crypto.randomUUID()}`;
  const iframe = document.createElement("iframe");
  iframe.name = frameName;
  iframe.hidden = true;
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "http://127.0.0.1:9666/flash/add";
  form.target = frameName;
  form.hidden = true;
  for (const [name, value] of [
    ["urls", urls.join("\n")],
    ["package", packageName],
    ["source", window.location.href],
  ]) {
    const input = document.createElement("input");
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(iframe, form);
  form.submit();
  window.setTimeout(() => {
    form.remove();
    iframe.remove();
  }, 5_000);
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
