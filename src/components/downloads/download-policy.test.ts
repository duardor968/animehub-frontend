import { describe, expect, it } from "vitest";
import {
  isRememberedDeviceAvailable,
  planDownloadDispatch,
} from "./download-policy";

describe("planDownloadDispatch", () => {
  it("never dispatches Click'n'Load from a portable device", () => {
    expect(
      planDownloadDispatch({
        profile: "portable",
        storedDestination: "CNL",
        myJdConnected: false,
        selectedDeviceId: null,
      }),
    ).toEqual({ action: "configure-myjd" });
    expect(
      planDownloadDispatch({
        profile: "portable",
        storedDestination: "CNL",
        myJdConnected: true,
        selectedDeviceId: "phone-session-device",
      }),
    ).toEqual({
      action: "start",
      destination: "MYJD",
      preferredDeviceId: "phone-session-device",
    });
  });

  it("reuses the selected MyJDownloader device during the session", () => {
    const input = {
      profile: "portable" as const,
      storedDestination: "MYJD" as const,
      myJdConnected: true,
      selectedDeviceId: "desktop-jd",
    };
    expect(planDownloadDispatch(input)).toEqual(planDownloadDispatch(input));
  });

  it("preserves desktop destinations exactly", () => {
    expect(
      planDownloadDispatch({
        profile: "desktop",
        storedDestination: "CNL",
        myJdConnected: false,
        selectedDeviceId: null,
      }),
    ).toEqual({ action: "start", destination: "CNL" });
    expect(
      planDownloadDispatch({
        profile: "desktop",
        storedDestination: "MYJD",
        myJdConnected: false,
        selectedDeviceId: null,
      }),
    ).toEqual({ action: "start", destination: "MYJD" });
  });
});

describe("isRememberedDeviceAvailable", () => {
  it("detects an offline or removed remembered device", () => {
    expect(isRememberedDeviceAvailable("a", ["a", "b"])).toBe(true);
    expect(isRememberedDeviceAvailable("a", ["b", "c"])).toBe(false);
  });
});
