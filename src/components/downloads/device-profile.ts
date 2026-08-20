export type DeviceProfile = "portable" | "desktop" | "unknown";

export interface DeviceNavigatorSnapshot {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { mobile?: boolean };
}

const portableUserAgent = /Android|iPhone|iPad|iPod/i;

export function detectDeviceProfile(
  source?: DeviceNavigatorSnapshot | null,
): DeviceProfile {
  if (!source) return "unknown";

  if (source.userAgentData?.mobile === true) return "portable";

  const userAgent = source.userAgent ?? "";
  if (portableUserAgent.test(userAgent)) return "portable";

  const isIpadosDesktopIdentity =
    source.platform === "MacIntel" && (source.maxTouchPoints ?? 0) > 1;
  if (isIpadosDesktopIdentity) return "portable";

  if (!userAgent && !source.platform && !source.userAgentData) return "unknown";
  return "desktop";
}

export function getDeviceProfile(): DeviceProfile {
  if (typeof navigator === "undefined") return "unknown";
  const browserNavigator = navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
  };
  return detectDeviceProfile({
    userAgent: browserNavigator.userAgent,
    platform: browserNavigator.platform,
    maxTouchPoints: browserNavigator.maxTouchPoints,
    userAgentData: browserNavigator.userAgentData,
  });
}

export function isPortableDevice() {
  return getDeviceProfile() === "portable";
}

export function getEffectiveDestination(
  profile: DeviceProfile,
  storedDestination: DownloadDestination,
): DownloadDestination {
  return profile === "portable" ? "MYJD" : storedDestination;
}
import type { DownloadDestination } from "./download-types";
