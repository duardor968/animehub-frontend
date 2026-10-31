import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiResponseError } from "@/lib/api/client";
import {
  attentionReason,
  hasRemoteSession,
  remoteClient,
  remoteEpisodeNumbers,
  remoteTarget,
  type RemoteDevice,
  type RemoteRequestInput,
} from "./remote-client";
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  apiFetch: vi.fn(),
}));
const fetch = vi.mocked(apiFetch);
const pc: RemoteDevice = {
  id: "pc1",
  name: "PC 1",
  profileRevision: 3,
  profiles: [{ id: "p1", label: "Anime", engine: "direct", isDefault: true }],
  lastSeenAt: "2026-10-22T12:00:00Z",
  online: true,
};
beforeEach(() => {
  localStorage.clear();
  fetch.mockReset();
});
describe("remote metadata transport", () => {
  it("shares one private capability creation for parallel initial calls", async () => {
    fetch
      .mockResolvedValueOnce({ id: "s", token: "private-capability" })
      .mockResolvedValue({ devices: [] });
    await Promise.all([remoteClient.devices(), remoteClient.devices()]);
    expect(
      fetch.mock.calls.filter(([p]) => p === "/remote/sessions"),
    ).toHaveLength(1);
    const request = fetch.mock.calls.find(([p]) => p === "/remote/devices")!;
    expect(new Headers(request[1]?.headers).get("authorization")).toBe(
      "Bearer private-capability",
    );
    expect(request[0]).not.toContain("private-capability");
  });
  it("invalidates a rejected capability without silently retrying a write", async () => {
    localStorage.setItem("animehub.remote.session.v1", "expired");
    fetch.mockRejectedValue(new ApiResponseError(401, "expired"));
    await expect(remoteClient.link("123456")).rejects.toThrow("expired");
    expect(hasRemoteSession()).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("pins device, profile revision, engine and idempotency key without resolved URLs", async () => {
    localStorage.setItem("animehub.remote.session.v1", "private");
    fetch.mockResolvedValue({ id: "r" });
    const body: RemoteRequestInput = {
      deviceId: pc.id,
      animeSlug: "series",
      episodeNumbers: [0, 1, 1.5],
      profileId: "p1",
      profileRevision: 3,
      engine: "direct",
    };
    await remoteClient.create(body, "key1");
    await remoteClient.create(body, "key1");
    for (const [path, init] of fetch.mock.calls) {
      expect(path).toBe("/remote/requests");
      expect(JSON.parse(init!.body as string)).toEqual(body);
      expect(new Headers(init?.headers).get("idempotency-key")).toBe("key1");
    }
  });
  it("expands catalogue ranges including fractional episodes without link resolution", async () => {
    fetch
      .mockResolvedValueOnce({
        data: [{ number: 0 }, { number: 1 }],
        meta: { totalPages: 2 },
      })
      .mockResolvedValueOnce({
        data: [{ number: 1.5 }, { number: 2 }],
        meta: { totalPages: 2 },
      });
    expect(
      await remoteEpisodeNumbers({
        slug: "series",
        title: "Series",
        from: 1,
        to: 1.5,
      }),
    ).toEqual([1, 1.5]);
    expect(fetch.mock.calls.map(([p]) => p)).toEqual([
      "/anime/series/episodes?page=1",
      "/anime/series/episodes?page=2",
    ]);
  });
  it("uses explicit episodes without any API lookup", async () => {
    expect(
      await remoteEpisodeNumbers({
        slug: "series",
        title: "Series",
        episodeNumbers: [0, 1, 1],
      }),
    ).toEqual([0, 1]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses the sole PC even with ask retained; asks again when topology returns to two PCs", () => {
    expect(remoteTarget([pc], "ask")).toBe(pc);
    expect(remoteTarget([pc, { ...pc, id: "pc2" }], "ask")).toBeUndefined();
    expect(remoteTarget([pc, { ...pc, id: "pc2" }], "removed")).toBeUndefined();
  });
  it("opens the live channel with the capability in a header and reports each announced change", async () => {
    localStorage.setItem("animehub.remote.session.v1", "private-capability");
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // A heartbeat, then events split anywhere across chunks.
        controller.enqueue(encoder.encode("\n:\n\nevent: devices\nid: 1\nda"));
        controller.enqueue(encoder.encode("ta: {}\n\nevent: requests\n"));
        controller.enqueue(
          encoder.encode("data: {}\n\nevent: other\ndata: {}\n\n"),
        );
        controller.close();
      },
    });
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(body, { status: 200 }));
    const changes: string[] = [];
    const open = vi.fn();
    await remoteClient.events(
      { open, change: (type) => changes.push(type) },
      new AbortController().signal,
    );
    expect(open).toHaveBeenCalledTimes(1);
    expect(changes).toEqual(["devices", "requests"]);
    const [url, init] = network.mock.calls[0];
    expect(String(url)).toMatch(/\/remote\/events$/);
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer private-capability",
    );
    network.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(
      remoteClient.events(
        { open, change: vi.fn() },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(hasRemoteSession()).toBe(false);
    network.mockRestore();
  });
  it("says which PC set a request aside and why, from its reason or the API's", () => {
    expect(attentionReason("local_profile_unavailable", "PC 1")).toBe(
      "No se descargará · PC 1 cambió su perfil de descarga; vuelve a enviarla",
    );
    expect(attentionReason("Destination profile changed", "PC 1")).toBe(
      attentionReason("local_profile_unavailable", "PC 1"),
    );
    expect(attentionReason("local_record_unavailable", "PC 1")).toBe(
      "No se descargará · PC 1 no pudo añadir el anime a su biblioteca; vuelve a enviarla",
    );
    expect(attentionReason("Desktop requires attention", "PC 1")).toBe(
      "Requiere atención en PC 1",
    );
    expect(attentionReason(null, "PC 1")).toBe("Requiere atención en PC 1");
  });
});
