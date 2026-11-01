import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toast } from "@heroui/react";
import { ApiResponseError } from "@/lib/api/client";
import {
  remoteClient,
  remoteEpisodeNumbers,
  type RemoteDevice,
  type RemoteRequest,
} from "./remote-client";
import { useRemoteDownloads } from "./use-remote-downloads";
vi.mock("@heroui/react", () => ({
  toast: Object.assign(
    vi.fn(() => "toast-1"),
    { update: vi.fn() },
  ),
}));
vi.mock("./remote-client", async (original) => ({
  ...(await original<typeof import("./remote-client")>()),
  hasRemoteSession: () => true,
  remoteEpisodeNumbers: vi.fn(),
  remoteClient: {
    events: vi.fn(),
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
  online: true,
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
  // The live channel stays connecting unless a test opens it.
  vi.mocked(remoteClient.events).mockReturnValue(new Promise(() => {}));
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
it("reads again on each change the live channel announces, and looks every 5 s only while it is down", async () => {
  vi.useFakeTimers();
  try {
    type On = Parameters<typeof remoteClient.events>[0];
    const channels: { on: On; drop: () => void }[] = [];
    vi.mocked(remoteClient.events).mockImplementation(
      (on) =>
        new Promise<void>((resolve) => channels.push({ on, drop: resolve })),
    );
    const { unmount } = renderHook(() => useRemoteDownloads(true));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(remoteClient.devices).toHaveBeenCalledTimes(1);
    expect(channels).toHaveLength(1);
    act(() => channels[0].on.open());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(remoteClient.devices).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(20000));
    expect(remoteClient.devices).toHaveBeenCalledTimes(2);
    act(() => channels[0].on.change("devices"));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(remoteClient.devices).toHaveBeenCalledTimes(3);

    // Dropped: one look at once, then every 5 s until it reconnects (1 s).
    channels[0].drop();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(remoteClient.devices).toHaveBeenCalledTimes(4);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(channels).toHaveLength(2);
    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(remoteClient.devices).toHaveBeenCalledTimes(5);
    act(() => channels[1].on.open());
    await act(() => vi.advanceTimersByTimeAsync(20000));
    expect(remoteClient.devices).toHaveBeenCalledTimes(6);
    unmount();
  } finally {
    vi.useRealTimers();
  }
});
it("says a send to a PC whose channel is closed waits for it", async () => {
  vi.mocked(remoteClient.devices).mockResolvedValue({
    devices: [{ ...pc, online: false }],
  });
  const { result } = renderHook(() => useRemoteDownloads(false));
  act(() =>
    result.current.start(
      { slug: "series", title: "Series", episodeNumbers: [1] },
      vi.fn(),
    ),
  );
  await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
  expect(toast).toHaveBeenCalledWith(
    "Pendiente de entrega · PC 1 sin conexión",
    expect.objectContaining({ description: "Series · Ep. 1" }),
  );
});
it("turns the sent toast to what the PC did once the channel says so", async () => {
  type On = Parameters<typeof remoteClient.events>[0];
  const channels: On[] = [];
  vi.mocked(remoteClient.events).mockImplementation((on) => {
    channels.push(on);
    return new Promise(() => {});
  });
  const { result } = renderHook(() => useRemoteDownloads(false));
  act(() =>
    result.current.start(
      { slug: "series", title: "Series", episodeNumbers: [1] },
      vi.fn(),
    ),
  );
  await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
  expect(toast).toHaveBeenCalledWith(
    "Enviando a PC 1…",
    expect.objectContaining({ isLoading: true, timeout: 0 }),
  );
  // Pending, so the channel opens; the PC takes it and the API says so.
  await waitFor(() => expect(channels).toHaveLength(1));
  vi.mocked(remoteClient.requests).mockResolvedValue({
    requests: [{ ...request, status: "accepted" }],
  });
  act(() => channels[0].change("requests"));
  await waitFor(() =>
    expect(toast.update).toHaveBeenCalledWith(
      "toast-1",
      "Recibida por PC 1 · En cola",
      expect.objectContaining({
        description: "Series · Ep. 1",
        isLoading: false,
        timeout: 5000,
      }),
    ),
  );
  expect(toast.update).toHaveBeenCalledTimes(1);
});
it("reads again after a reload only the requests it left waiting", async () => {
  vi.mocked(remoteClient.requests).mockResolvedValue({ requests: [request] });
  localStorage.setItem("animehub.remote.pending.v1", "1");
  const { result, unmount } = renderHook(() => useRemoteDownloads(false));
  await waitFor(() => expect(result.current.requests).toEqual([request]));
  expect(result.current.brief(request)).toEqual({
    state: "Pendiente",
    name: "PC 1",
  });
  expect(localStorage.getItem("animehub.remote.pending.v1")).toBe("1");
  unmount();

  // Taken meanwhile: the mark goes, and the next reload reads nothing.
  vi.mocked(remoteClient.requests).mockResolvedValue({
    requests: [{ ...request, status: "accepted" }],
  });
  renderHook(() => useRemoteDownloads(false));
  await waitFor(() =>
    expect(localStorage.getItem("animehub.remote.pending.v1")).toBeNull(),
  );
  vi.clearAllMocks();
  renderHook(() => useRemoteDownloads(false));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(remoteClient.requests).not.toHaveBeenCalled();
});
async function sendWithFakeTimers() {
  type On = Parameters<typeof remoteClient.events>[0];
  const channels: On[] = [];
  vi.mocked(remoteClient.events).mockImplementation((on) => {
    channels.push(on);
    return new Promise(() => {});
  });
  vi.mocked(remoteClient.requests).mockResolvedValue({ requests: [request] });
  const hook = renderHook(() => useRemoteDownloads(false));
  act(() =>
    hook.result.current.start(
      { slug: "series", title: "Series", episodeNumbers: [1] },
      vi.fn(),
    ),
  );
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(hook.result.current.status(request)).toBe("Enviando a PC 1…");
  expect(hook.result.current.brief(request).state).toBe("Enviando…");
  expect(channels).toHaveLength(1);
  return { ...hook, channel: channels[0] };
}
it("reads as waiting for the PC once 15 s pass without it taking the request", async () => {
  vi.useFakeTimers();
  try {
    const { result, unmount } = await sendWithFakeTimers();
    await act(() => vi.advanceTimersByTimeAsync(14000));
    expect(result.current.status(request)).toBe("Enviando a PC 1…");
    expect(toast.update).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.status(request)).toBe("Pendiente de entrega · PC 1");
    expect(toast.update).toHaveBeenCalledWith(
      "toast-1",
      "Pendiente de entrega · PC 1",
      expect.objectContaining({ isLoading: false, timeout: 5000 }),
    );
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it("times each request sent on its own", async () => {
  vi.useFakeTimers();
  try {
    const { result, unmount } = await sendWithFakeTimers();
    await act(() => vi.advanceTimersByTimeAsync(10000));
    const second = { ...request, id: "r2", episodeNumbers: [2] };
    vi.mocked(remoteClient.create).mockResolvedValue(second);
    vi.mocked(remoteClient.requests).mockResolvedValue({
      requests: [second, request],
    });
    act(() =>
      result.current.start(
        { slug: "series", title: "Series", episodeNumbers: [2] },
        vi.fn(),
      ),
    );
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(result.current.status(request)).toBe("Pendiente de entrega · PC 1");
    expect(result.current.status(second)).toBe("Enviando a PC 1…");
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(result.current.status(second)).toBe("Pendiente de entrega · PC 1");
    unmount();
  } finally {
    vi.useRealTimers();
  }
});
it("says the PC is offline as soon as it disconnects while sending, and stays pending when it returns", async () => {
  vi.useFakeTimers();
  try {
    const { result, channel, unmount } = await sendWithFakeTimers();
    vi.mocked(remoteClient.devices).mockResolvedValue({
      devices: [{ ...pc, online: false }],
    });
    act(() => channel.change("devices"));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.status(request)).toBe(
      "Pendiente de entrega · PC 1 sin conexión",
    );
    expect(toast.update).toHaveBeenCalledWith(
      "toast-1",
      "Pendiente de entrega · PC 1 sin conexión",
      expect.objectContaining({ isLoading: false, timeout: 5000 }),
    );
    // Back within the 15 s: still waiting, not "Enviando" again.
    vi.mocked(remoteClient.devices).mockResolvedValue({ devices: [pc] });
    act(() => channel.change("devices"));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.status(request)).toBe("Pendiente de entrega · PC 1");
    unmount();
  } finally {
    vi.useRealTimers();
  }
});
it("titles the sent toast with the state a cancellation leaves", async () => {
  vi.mocked(remoteClient.cancel).mockResolvedValue({
    ...request,
    status: "cancelled",
  });
  const { result } = renderHook(() => useRemoteDownloads(false));
  act(() =>
    result.current.start(
      { slug: "series", title: "Series", episodeNumbers: [1] },
      vi.fn(),
    ),
  );
  await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(result.current.busy).toBe(false));
  vi.mocked(remoteClient.requests).mockResolvedValue({
    requests: [{ ...request, status: "cancelled" }],
  });
  act(() => result.current.cancel("r1"));
  await waitFor(() =>
    expect(toast.update).toHaveBeenCalledWith(
      "toast-1",
      "Solicitud cancelada · PC 1",
      expect.objectContaining({ description: "Series · Ep. 1" }),
    ),
  );
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
