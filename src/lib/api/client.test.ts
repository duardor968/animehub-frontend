import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiConnectionError, apiFetch } from "./client";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("waits for the local API during a server-rendered GET", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("connection refused"))
      .mockRejectedValueOnce(new TypeError("connection refused"))
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { status: "ok" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const request = apiFetch<{ data: { status: string } }>("/health/live");
    await vi.runAllTimersAsync();

    await expect(request).resolves.toEqual({ data: { status: "ok" } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a browser request behind the user's back", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError());
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/home", {}, true)).rejects.toBeInstanceOf(
      ApiConnectionError,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
