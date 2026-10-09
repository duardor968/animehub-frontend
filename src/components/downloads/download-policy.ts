import { getEffectiveDestination, type DeviceProfile } from "./device-profile";
import type { DownloadDestination } from "./download-types";

export type DownloadDispatchPlan =
  | { action: "configure-myjd" }
  | {
      action: "start";
      destination: DownloadDestination;
      preferredDeviceId?: string;
    };

export function planDownloadDispatch({
  profile,
  storedDestination,
  myJdConnected,
  selectedDeviceId,
}: {
  profile: DeviceProfile;
  storedDestination: DownloadDestination;
  myJdConnected: boolean;
  selectedDeviceId: string | null;
}): DownloadDispatchPlan {
  const destination = getEffectiveDestination(profile, storedDestination);
  if (profile !== "portable" || destination !== "MYJD") {
    return { action: "start", destination };
  }
  if (!myJdConnected || !selectedDeviceId) {
    return { action: "configure-myjd" };
  }
  return {
    action: "start",
    destination: "MYJD",
    preferredDeviceId: selectedDeviceId,
  };
}

export function isRememberedDeviceAvailable(
  selectedDeviceId: string,
  availableDeviceIds: string[],
) {
  return availableDeviceIds.includes(selectedDeviceId);
}
