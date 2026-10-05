import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiResponseError,
  ApiTimeoutError,
  apiFetch,
  isApiNotFoundError,
} from "./client";

describe("isApiNotFoundError", () => {
  it("classifies only a real API 404 as not found", () => {
    expect(isApiNotFoundError(new ApiResponseError(404, "No existe"))).toBe(
      true,
    );
    expect(isApiNotFoundError(new ApiResponseError(503, "No disponible"))).toBe(
      false,
    );
    expect(isApiNotFoundError(new Error("Fallo de red"))).toBe(false);
  });
});

describe("apiFetch budgets", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("aborts a stalled connection at the home deadline", async () => {
    const fetch = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetch);
    const response = apiFetch("/home", {}, false, {
      timeoutMs: 3_000,
      retryDelays: [0],
    });
    const rejected = expect(response).rejects.toBeInstanceOf(ApiTimeoutError);
    await vi.advanceTimersByTimeAsync(3_000);
    await rejected;
    expect(
      (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].signal
        ?.aborted,
    ).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the same deadline while reading the response body", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: () => new Promise(() => {}),
    }));
    vi.stubGlobal("fetch", fetch);
    const response = apiFetch("/home", {}, false, { timeoutMs: 3_000 });
    const rejected = expect(response).rejects.toBeInstanceOf(ApiTimeoutError);
    await vi.advanceTimersByTimeAsync(3_000);
    await rejected;
    expect(
      (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].signal
        ?.aborted,
    ).toBe(true);
  });

  it("does not let retry delays exceed the total budget", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("connection failed"));
    vi.stubGlobal("fetch", fetch);
    const response = apiFetch("/home", {}, false, {
      timeoutMs: 500,
      retryDelays: [0, 400, 900],
    });
    const rejected = expect(response).rejects.toBeInstanceOf(ApiTimeoutError);
    await vi.advanceTimersByTimeAsync(500);
    await rejected;
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("honors caller cancellation and removes its timeout", async () => {
    const fetch = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    const response = apiFetch("/home", { signal: controller.signal }, true, {
      timeoutMs: 3_000,
    });
    const rejected = expect(response).rejects.toBeInstanceOf(ApiTimeoutError);
    controller.abort();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not impose a home timeout on an existing download operation", async () => {
    let complete!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            complete = resolve;
          }),
      ),
    );
    const controller = new AbortController();
    const response = apiFetch(
      "/downloads",
      { method: "POST", signal: controller.signal },
      true,
    );
    await vi.advanceTimersByTimeAsync(25_000);
    expect(controller.signal.aborted).toBe(false);
    complete({ ok: true, json: async () => ({ ok: true }) } as Response);
    await expect(response).resolves.toEqual({ ok: true });
  });

  it("preserves Headers inputs and releases timers after success", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetch);
    await apiFetch(
      "/home",
      { headers: new Headers({ "x-request-id": "test-id" }) },
      true,
      { timeoutMs: 3_000 },
    );
    const headers = fetch.mock.calls[0][1].headers as Headers;
    expect(headers.get("x-request-id")).toBe("test-id");
    expect(headers.get("accept")).toBe("application/json");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves a download's own 25-second deadline and timeout classification", async () => {
    const fetch = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    const timeout = setTimeout(
      () =>
        controller.abort(new DOMException("Download deadline", "TimeoutError")),
      25_000,
    );
    const response = apiFetch(
      "/downloads",
      { method: "POST", signal: controller.signal },
      true,
    ).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(controller.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(22_000);
    expect(await response).toBeInstanceOf(ApiTimeoutError);
    expect(
      (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].signal,
    ).toBe(controller.signal);
    clearTimeout(timeout);
  });
});
