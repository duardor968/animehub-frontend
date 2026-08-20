import { describe, expect, it } from "vitest";
import { detectDeviceProfile, getEffectiveDestination } from "./device-profile";

describe("detectDeviceProfile", () => {
  it.each([
    [
      "Android phone",
      { userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile" },
    ],
    [
      "Android tablet",
      { userAgent: "Mozilla/5.0 (Linux; Android 14; SM-X710)" },
    ],
    [
      "iPhone",
      { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" },
    ],
    ["iPad", { userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)" }],
    [
      "iPadOS desktop identity",
      {
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
        platform: "MacIntel",
        maxTouchPoints: 5,
      },
    ],
    [
      "UA Client Hints mobile",
      { userAgent: "Mozilla/5.0", userAgentData: { mobile: true } },
    ],
  ])("classifies %s as portable", (_label, snapshot) => {
    expect(detectDeviceProfile(snapshot)).toBe("portable");
  });

  it.each([
    [
      "Windows desktop",
      {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        platform: "Win32",
        maxTouchPoints: 0,
      },
    ],
    [
      "macOS desktop",
      {
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        platform: "MacIntel",
        maxTouchPoints: 0,
      },
    ],
    [
      "Windows touch laptop",
      {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        platform: "Win32",
        maxTouchPoints: 10,
      },
    ],
  ])("classifies %s as desktop", (_label, snapshot) => {
    expect(detectDeviceProfile(snapshot)).toBe("desktop");
  });

  it("does not use viewport width as an input", () => {
    expect(
      detectDeviceProfile({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        platform: "Win32",
      }),
    ).toBe("desktop");
  });

  it("returns unknown without navigator evidence", () => {
    expect(detectDeviceProfile()).toBe("unknown");
    expect(detectDeviceProfile({})).toBe("unknown");
  });
});

describe("getEffectiveDestination", () => {
  it("forces MyJDownloader only on portable devices", () => {
    expect(getEffectiveDestination("portable", "CNL")).toBe("MYJD");
    expect(getEffectiveDestination("portable", "MYJD")).toBe("MYJD");
  });

  it("preserves desktop and unknown preferences", () => {
    expect(getEffectiveDestination("desktop", "CNL")).toBe("CNL");
    expect(getEffectiveDestination("desktop", "MYJD")).toBe("MYJD");
    expect(getEffectiveDestination("unknown", "CNL")).toBe("CNL");
  });
});
