import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiResponseError } from "@/lib/api/client";
import {
  remoteClient,
  remoteEpisodeNumbers,
  type RemoteDevice,
  type RemoteRequest,
} from "./remote-client";
import { useRemoteDownloads } from "./use-remote-downloads";
vi.mock("@heroui/react", () => ({ toast: vi.fn() }));
vi.mock("./remote-client", async (original) => ({
  ...(await original<typeof import("./remote-client")>()),
  hasRemoteSession: () => true,
  remoteEpisodeNumbers: vi.fn(),
  remoteClient: {
    devices: vi.fn(),
    requests: vi.fn(),
    link: vi.fn(),
    unlink: vi.fn(),
    create: vi.fn(),
    cancel: vi.fn(),
  },
}));
const pc: RemoteDevice = {
  id: "pc1",
  name: "PC 1",
  profileRevision: 3,
  profiles: [
    { id: "profile1", label: "Anime", engine: "direct", isDefault: true },
  ],
  lastSeenAt: new Date().toISOString(),
};
const request: RemoteRequest = {
  id: "r1",
  deviceId: "pc1",
  animeSlug: "series",
  animeTitle: "Series",
  episodeNumbers: [1],
  profileId: "profile1",
  profileRevision: 3,
  engine: "direct",
  status: "pending",
  reason: null,
};
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(remoteClient.devices).mockResolvedValue({ devices: [pc] });
  vi.mocked(remoteClient.requests).mockResolvedValue({ requests: [] });
  vi.mocked(remoteEpisodeNumbers).mockResolvedValue([1]);
  vi.mocked(remoteClient.create).mockResolvedValue(request);
});
afterEach(cleanup);
it("does not fetch before a user action", () => {
  renderHook(() => useRemoteDownloads(false));
  expect(remoteClient.devices).not.toHaveBeenCalled();
  expect(remoteClient.requests).not.toHaveBeenCalled();
});
it("names the PC it last sent to after a reload, without fetching", async () => {
  localStorage.setItem(
    "animehub.remote.target.v2",
    JSON.stringify({ id: "pc1", name: "PC 1" }),
  );
  const { result } = renderHook(() => useRemoteDownloads(false));
  await waitFor(() => expect(result.current.target?.name).toBe("PC 1"));
  expect(remoteClient.devices).not.toHaveBeenCalled();
});
it("remembers the PC the bar names once the PCs load, never a label", async () => {
  // v1 stored labels of the UI as if they were PCs.
  localStorage.setItem("animehub.remote.target.v1", "Elegir PC");
  const { result } = renderHook(() => useRemoteDownloads(false));
  await waitFor(() =>
    expect(localStorage.getItem("animehub.remote.target.v1")).toBeNull(),
  );
  expect(result.current.target).toBeNull();
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.target?.name).toBe("PC 1"));
  expect(
    JSON.parse(localStorage.getItem("animehub.remote.target.v2") ?? "null"),
  ).toEqual({ id: "pc1", name: "PC 1" });

  // Two PCs and "ask every time": no PC to name, nothing stored.
  vi.mocked(remoteClient.devices).mockResolvedValue({
    devices: [pc, { ...pc, id: "pc2", name: "PC 2" }],
  });
  act(() => result.current.choosePreferred("ask"));
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.target).toBeNull());
  expect(localStorage.getItem("animehub.remote.target.v2")).toBeNull();
});
it("follows the PC chosen in another tab", async () => {
  const pc2 = { ...pc, id: "pc2", name: "PC 2" };
  vi.mocked(remoteClient.devices).mockResolvedValue({ devices: [pc, pc2] });
  localStorage.setItem("animehub.remote.preferred.v1", "pc1");
  const { result } = renderHook(() => useRemoteDownloads(false));
  await waitFor(() => expect(result.current.preferred).toBe("pc1"));

  // The other tab writes the preference: the event and the next send follow.
  localStorage.setItem("animehub.remote.preferred.v1", "pc2");
  act(() => {
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "animehub.remote.preferred.v1",
        newValue: "pc2",
      }),
    );
  });
  expect(result.current.preferred).toBe("pc2");

  // Even without the event, a send reads the stored preference.
  localStorage.setItem("animehub.remote.preferred.v1", "pc1");
  act(() =>
    result.current.start(
      { slug: "series", title: "Series", episodeNumbers: [1] },
      vi.fn(),
    ),
  );
  await waitFor(() => expect(remoteClient.create).toHaveBeenCalled());
  expect(vi.mocked(remoteClient.create).mock.calls[0][0].deviceId).toBe("pc1");
});
it("polls again after a dropped connection and stops once the link expired", async () => {
  vi.useFakeTimers();
  try {
    vi.mocked(remoteClient.devices).mockRejectedValueOnce(new Error("offline"));
    const { unmount } = renderHook(() => useRemoteDownloads(true));
    await vi.advanceTimersByTimeAsync(0);
    expect(remoteClient.devices).toHaveBeenCalledTimes(1);
    vi.mocked(remoteClient.devices).mockRejectedValueOnce(
      new ApiResponseError(401, "expired"),
    );
    await vi.advanceTimersByTimeAsync(5000);
    expect(remoteClient.devices).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(15000);
    expect(remoteClient.devices).toHaveBeenCalledTimes(2);
    unmount();
  } finally {
    vi.useRealTimers();
  }
});
it("sends directly to the sole PC and preserves ask for a later second PC", async () => {
  localStorage.setItem("animehub.remote.preferred.v1", "ask");
  const { result } = renderHook(() => useRemoteDownloads(false));
  await waitFor(() => expect(result.current.preferred).toBe("ask"));
  act(() =>
    result.current.start(
      { slug: "series", title: "Series", episodeNumbers: [1] },
      vi.fn(),
    ),
  );
  await waitFor(() => expect(remoteClient.create).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(result.current.busy).toBe(false));
  expect(result.current.panel).toBe(null);
  vi.mocked(remoteClient.devices).mockResolvedValue({
    devices: [pc, { ...pc, id: "pc2" }],
  });
  act(() =>
    result.current.start(
      { slug: "series", title: "Series", episodeNumbers: [1] },
      vi.fn(),
    ),
  );
  await waitFor(() => expect(result.current.panel).toBe("choose"));
  expect(remoteClient.create).toHaveBeenCalledTimes(1);
});
it("retries an unknown result using the same device, profile revision and key", async () => {
  vi.mocked(remoteClient.create)
    .mockRejectedValueOnce(new Error("connection lost"))
    .mockResolvedValue(request);
  const { result } = renderHook(() => useRemoteDownloads(false));
  act(() =>
    result.current.start(
      { slug: "series", title: "Series", episodeNumbers: [1] },
      vi.fn(),
    ),
  );
  await waitFor(() =>
    expect(result.current.canRetry && !result.current.busy).toBe(true),
  );
  const original = vi.mocked(remoteClient.create).mock.calls[0];
  act(() => result.current.choosePreferred("pc2"));
  act(() => result.current.retry());
  await waitFor(() => expect(remoteClient.create).toHaveBeenCalledTimes(2));
  expect(vi.mocked(remoteClient.create).mock.calls[1]).toEqual(original);
});
it("asks for a destination when the last link was revoked, without a copy fallback", async () => {
  vi.mocked(remoteClient.devices).mockResolvedValue({ devices: [] });
  const chooseDestination = vi.fn();
  const { result } = renderHook(() => useRemoteDownloads(false));
  act(() =>
    result.current.start(
      { slug: "series", title: "Series", episodeNumbers: [1] },
      chooseDestination,
    ),
  );
  await waitFor(() => expect(chooseDestination).toHaveBeenCalledTimes(1));
  expect(remoteClient.create).not.toHaveBeenCalled();
  expect(remoteEpisodeNumbers).not.toHaveBeenCalled();
});
it("reflects accepted after a cancel loses the receiver race", async () => {
  vi.mocked(remoteClient.cancel).mockRejectedValue(
    new ApiResponseError(409, "already accepted"),
  );
  vi.mocked(remoteClient.requests).mockResolvedValue({
    requests: [{ ...request, status: "accepted" }],
  });
  const { result } = renderHook(() => useRemoteDownloads(false));
  act(() => result.current.cancel("r1"));
  await waitFor(() => expect(result.current.error).toBe("already accepted"));
  expect(result.current.requests[0].status).toBe("accepted");
});
it("locates a missing profile in Desktop and retries the same PC after refreshing its profile", async () => {
  vi.mocked(remoteClient.devices).mockResolvedValue({
    devices: [{ ...pc, profiles: [] }],
  });
  const { result } = renderHook(() => useRemoteDownloads(false));
  act(() =>
    result.current.start(
      { slug: "series", title: "Series", episodeNumbers: [1] },
      vi.fn(),
    ),
  );
  await waitFor(() =>
    expect(result.current.error).toContain(
      "AnimeHub para PC → Ajustes → Descargas",
    ),
  );
  expect(result.current.errorScope).toBe("request");
  expect(result.current.profileRetry).toBe("pc1");
  expect(remoteClient.create).not.toHaveBeenCalled();
  act(() => result.current.choosePreferred("pc2"));
  vi.mocked(remoteClient.devices).mockResolvedValue({
    devices: [
      { ...pc, profileRevision: 4 },
      { ...pc, id: "pc2" },
    ],
  });
  act(() => result.current.retryProfile());
  await waitFor(() => expect(remoteClient.create).toHaveBeenCalledTimes(1));
  expect(vi.mocked(remoteClient.create).mock.calls[0][0]).toMatchObject({
    deviceId: "pc1",
    profileRevision: 4,
  });
  expect(result.current.error).toBeNull();
});
