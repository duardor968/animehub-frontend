import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const addFirst = vi.fn();
  const addSecond = vi.fn();
  const devices = [
    { id: "first", name: "Desktop", linkGrabberAddLinks: addFirst },
    { id: "second", name: "Server", linkGrabberAddLinks: addSecond },
  ];
  const client = {
    listDevices: vi.fn().mockResolvedValue(devices),
    disconnect: vi.fn(),
  };
  return {
    addFirst,
    addSecond,
    client,
    connect: vi.fn().mockResolvedValue(client),
  };
});

vi.mock("jdownloader-connect", () => ({ default: mocks.connect }));

import {
  connectMyJd,
  disconnectMyJd,
  sendToClickNLoad,
  sendToMyJd,
} from "./download-client";

describe("download clients", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await disconnectMyJd();
    sessionStorage.clear();
  });

  it("keeps the MyJDownloader session in memory and addresses the chosen device", async () => {
    const devices = await connectMyJd("user@example.com", "password");

    expect(devices).toHaveLength(2);
    expect(
      JSON.parse(sessionStorage.getItem("animehub.myjd.session") ?? "{}"),
    ).toEqual(expect.objectContaining({ active: true }));
    await sendToMyJd("second", "Fixture Anime", ["https://example.com/one"]);
    expect(mocks.addSecond).toHaveBeenCalledWith({
      links: "https://example.com/one",
      packageName: "Fixture Anime",
      autostart: false,
    });
    expect(mocks.addFirst).not.toHaveBeenCalled();
  });

  it("verifies Click'n'Load and waits for its acknowledgement", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("JDownloader", { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendToClickNLoad("Fixture Anime", ["https://example.com/one"]),
    ).resolves.toEqual({ acceptedAt: expect.any(String) });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:9666/flash/");
    const request = fetchMock.mock.calls[1];
    expect(request[0]).toBe("http://127.0.0.1:9666/flash/add");
    expect(request[1].method).toBe("POST");
    expect(request[1].body.toString()).toContain(
      "urls=https%3A%2F%2Fexample.com%2Fone",
    );
  });

  it("reports when the local JDownloader service is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );

    await expect(
      sendToClickNLoad("Fixture Anime", ["https://example.com/one"]),
    ).rejects.toThrow("JDownloader no aceptó la solicitud");
  });
});
