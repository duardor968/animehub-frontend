// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./client";

const incoming = vi.hoisted(() => ({
  headers: new Headers() as Headers | Error,
}));

vi.mock("next/headers", () => ({
  headers: async () => {
    if (incoming.headers instanceof Error) throw incoming.headers;
    return incoming.headers;
  },
}));

function stubFetch() {
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const sent = (fetch: ReturnType<typeof stubFetch>) =>
  fetch.mock.calls[0][1] as RequestInit & { headers: Headers };

beforeEach(() => {
  incoming.headers = new Headers();
});
afterEach(() => vi.unstubAllGlobals());

describe("apiFetch on the server", () => {
  it("forwards the visitor's address so the API limits per visitor", async () => {
    incoming.headers = new Headers({
      "x-forwarded-for": "203.0.113.9, 10.0.0.2",
      "x-real-ip": "198.51.100.7",
      "cf-connecting-ip": "2001:db8::1",
    });
    const fetch = stubFetch();
    await apiFetch("/home", {}, false, { retryDelays: [0] });
    // Cloudflare's header wins, and it replaces whatever was there.
    expect(sent(fetch).headers.get("x-forwarded-for")).toBe("2001:db8::1");
    expect(sent(fetch).cache).toBe("no-store");
  });

  it("uses the last proxy hop when there is no edge header", async () => {
    incoming.headers = new Headers({
      "x-forwarded-for": "6.6.6.6, 203.0.113.9",
    });
    const fetch = stubFetch();
    await apiFetch("/home", {}, false, { retryDelays: [0] });
    expect(sent(fetch).headers.get("x-forwarded-for")).toBe("203.0.113.9");
  });

  it("forwards nothing outside a request (build, scripts)", async () => {
    incoming.headers = new Error(
      "`headers` was called outside a request scope",
    );
    const fetch = stubFetch();
    await expect(
      apiFetch("/home", {}, false, { retryDelays: [0] }),
    ).resolves.toEqual({ ok: true });
    expect(sent(fetch).headers.has("x-forwarded-for")).toBe(false);
  });

  it("keeps shared, cacheable requests free of visitor data", async () => {
    incoming.headers = new Headers({ "x-real-ip": "198.51.100.7" });
    const fetch = stubFetch();
    await apiFetch("/sitemap/anime", { next: { revalidate: 3_600 } }, false, {
      retryDelays: [0],
    });
    expect(sent(fetch).headers.has("x-forwarded-for")).toBe(false);
    expect(sent(fetch).cache).toBeUndefined();
  });
});
