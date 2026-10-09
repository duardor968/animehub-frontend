import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectDeviceProfile,
  type DeviceNavigatorSnapshot,
} from "@/components/downloads/device-profile";
import { deviceProfileScript } from "./device-script";

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.device;
});

const snapshots: DeviceNavigatorSnapshot[] = [
  { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)" },
  { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)" },
  {
    userAgent: "Mozilla/5.0 (Macintosh)",
    platform: "MacIntel",
    maxTouchPoints: 5,
  },
  {
    userAgent: "Mozilla/5.0 (Macintosh)",
    platform: "MacIntel",
    maxTouchPoints: 0,
  },
  {
    userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
    userAgentData: { mobile: true },
  },
  { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32" },
];

describe("deviceProfileScript", () => {
  it.each(snapshots)("matches detectDeviceProfile for %j", (snapshot) => {
    vi.stubGlobal("navigator", snapshot);
    new Function(deviceProfileScript)();
    expect(document.documentElement.dataset.device).toBe(
      detectDeviceProfile(snapshot),
    );
  });
});
