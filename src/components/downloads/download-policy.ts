import { getEffectiveDestination, type DeviceProfile } from "./device-profile";
import { requestEpisodeCount } from "./download-copy";
import type { DownloadDestination, DownloadRequest } from "./download-types";

type DownloadDispatchPlan =
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

/** From this many episodes a download asks first, whatever started it. */
const CONFIRM_FROM_EPISODES = 25;

/** Episodes a request covers: its count or, for a range of unknown count,
 *  the whole numbers between its bounds. */
function estimatedCount(request: DownloadRequest) {
  const known = requestEpisodeCount(request);
  if (known > 0 || request.from === undefined || request.to === undefined)
    return known;
  const [low, high] = [request.from, request.to].sort((a, b) => a - b);
  return Math.floor(high) - Math.ceil(low) + 1;
}

/** Large downloads ask first; a copy to the clipboard never does (nothing
 *  irreversible). A whole series of unknown size counts as large. */
export function needsConfirmation(
  request: DownloadRequest,
  destination: DownloadDestination,
) {
  if (destination === "COPY") return false;
  if (request.all && !request.total) return true;
  return estimatedCount(request) >= CONFIRM_FROM_EPISODES;
}
