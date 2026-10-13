import { describe, expect, it } from "vitest";
import { needsConfirmation, planDownloadDispatch } from "./download-policy";

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

describe("planDownloadDispatch with the copy destination", () => {
  it("lets phones without MyJDownloader copy the links", () => {
    expect(
      planDownloadDispatch({
        profile: "portable",
        storedDestination: "COPY",
        myJdConnected: false,
        selectedDeviceId: null,
      }),
    ).toEqual({ action: "start", destination: "COPY" });
  });
});

describe("needsConfirmation", () => {
  const base = { slug: "a", title: "A" };
  const list = (count: number) =>
    Array.from({ length: count }, (_, index) => index + 1);

  it("asks from 25 episodes, however they were chosen", () => {
    expect(
      needsConfirmation({ ...base, episodeNumbers: list(24) }, "CNL"),
    ).toBe(false);
    expect(
      needsConfirmation({ ...base, episodeNumbers: list(25) }, "CNL"),
    ).toBe(true);
    expect(
      needsConfirmation({ ...base, from: 1, to: 24, total: 24 }, "CNL"),
    ).toBe(false);
    expect(needsConfirmation({ ...base, all: true, total: 25 }, "CNL")).toBe(
      true,
    );
    expect(needsConfirmation({ ...base, all: true, total: 12 }, "CNL")).toBe(
      false,
    );
  });

  it("counts a range of unknown size by its whole numbers", () => {
    expect(needsConfirmation({ ...base, from: 50, to: 26 }, "CNL")).toBe(true);
    expect(needsConfirmation({ ...base, from: 1, to: 24.5 }, "CNL")).toBe(
      false,
    );
    expect(needsConfirmation({ ...base, all: true }, "CNL")).toBe(true);
  });

  it("never asks before copying to the clipboard", () => {
    expect(needsConfirmation({ ...base, all: true }, "COPY")).toBe(false);
    expect(needsConfirmation({ ...base, all: true }, "MYJD")).toBe(true);
  });
});
