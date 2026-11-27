import { apiFetch, type DesktopReleaseResponse } from "@/lib/api/client";

export const DESKTOP_RELEASES_FALLBACK_URL =
  "https://github.com/duardor968/animehub-desktop/releases/latest";

export const DESKTOP_PROMO_SEEN_KEY = "animehub.desktop-promo.seen.v1";

export interface DesktopReleaseInfo {
  version: string | null;
  windowsUrl: string;
  linuxAppImageUrl: string;
  linuxDebUrl: string;
  releaseUrl: string;
}

export const DESKTOP_RELEASE_FALLBACK: DesktopReleaseInfo = {
  version: null,
  windowsUrl: DESKTOP_RELEASES_FALLBACK_URL,
  linuxAppImageUrl: DESKTOP_RELEASES_FALLBACK_URL,
  linuxDebUrl: DESKTOP_RELEASES_FALLBACK_URL,
  releaseUrl: DESKTOP_RELEASES_FALLBACK_URL,
};

let cachedReleasePromise: Promise<DesktopReleaseInfo> | null = null;
let cachedReleaseValue: DesktopReleaseInfo | null = null;
let seenFallback = false;
let storageWriteFailed = false;

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function firstAssetUrl(
  asset: { urls?: readonly string[] } | null | undefined,
): string | null {
  if (!asset || !Array.isArray(asset.urls)) return null;
  for (const candidate of asset.urls) {
    const url = safeHttpUrl(candidate);
    if (url) return url;
  }
  return null;
}

/** Normalizes GET /desktop/releases/latest into download URLs, falling back to
 *  GitHub Releases when the API response is paused, missing or malformed. */
export function resolveDesktopRelease(
  response: DesktopReleaseResponse | null | undefined,
): DesktopReleaseInfo {
  const data = response?.data;
  if (
    !data ||
    typeof data !== "object" ||
    data.paused === true ||
    !data.assets ||
    typeof data.assets !== "object"
  ) {
    return DESKTOP_RELEASE_FALLBACK;
  }
  const version =
    typeof data.version === "string" && data.version.trim()
      ? data.version.trim()
      : null;
  const releaseUrl =
    safeHttpUrl(data.releaseUrl) ?? DESKTOP_RELEASES_FALLBACK_URL;
  return {
    version,
    windowsUrl:
      firstAssetUrl(data.assets.windowsInstaller) ??
      DESKTOP_RELEASES_FALLBACK_URL,
    linuxAppImageUrl:
      firstAssetUrl(data.assets.linuxAppImage) ?? DESKTOP_RELEASES_FALLBACK_URL,
    linuxDebUrl:
      firstAssetUrl(data.assets.linuxDeb) ?? DESKTOP_RELEASES_FALLBACK_URL,
    releaseUrl,
  };
}

export function getCachedDesktopRelease(): DesktopReleaseInfo | null {
  return cachedReleaseValue;
}

/** Fetches the latest desktop release once per browser session. */
export function getDesktopRelease(): Promise<DesktopReleaseInfo> {
  if (!cachedReleasePromise) {
    cachedReleasePromise = apiFetch<DesktopReleaseResponse>(
      "/desktop/releases/latest",
      {},
      true,
      { timeoutMs: 10_000 },
    )
      .then((response) => resolveDesktopRelease(response))
      .catch(() => DESKTOP_RELEASE_FALLBACK)
      .then((info) => {
        cachedReleaseValue = info;
        return info;
      });
  }
  return cachedReleasePromise;
}

export function formatDesktopReleaseSubtitle(version: string | null): string {
  return version ? `Versión ${version} · Windows y Linux` : "Windows y Linux";
}

export function hasSeenDesktopPromo(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (window.localStorage.getItem(DESKTOP_PROMO_SEEN_KEY) === "1")
      return true;
    return storageWriteFailed ? seenFallback : false;
  } catch {
    return seenFallback;
  }
}

export function markDesktopPromoSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DESKTOP_PROMO_SEEN_KEY, "1");
  } catch {
    storageWriteFailed = true;
    seenFallback = true;
  }
}

export function openDesktopDownload(url: string): void {
  if (typeof window === "undefined") return;
  const target = safeHttpUrl(url) ?? DESKTOP_RELEASES_FALLBACK_URL;
  window.open(target, "_blank", "noopener,noreferrer");
}

/** Clears module-level session caches between unit tests. */
export function resetDesktopReleaseStateForTests(): void {
  cachedReleasePromise = null;
  cachedReleaseValue = null;
  seenFallback = false;
  storageWriteFailed = false;
}
