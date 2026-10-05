import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiTimeoutError } from "./client";
import { fetchHome } from "./home";

vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  apiFetch: vi.fn(),
}));
afterEach(() => vi.restoreAllMocks());

describe("home request correlation", () => {
  it("uses a bounded single request and logs only safe server fields", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.mocked(apiFetch).mockResolvedValue({
      data: { featured: [], recentEpisodes: [], recentAnime: [] },
      meta: {},
    });
    await fetchHome();
    const [, init, client, options] = vi.mocked(apiFetch).mock.calls.at(-1)!;
    const requestId = (init?.headers as Record<string, string>)["x-request-id"];
    expect(requestId).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i,
    );
    expect(client).toBe(false);
    expect(options).toEqual({ timeoutMs: 3_000, retryDelays: [0] });
    expect(JSON.parse(log.mock.calls[0][0])).toEqual({
      event: "home_ssr_api",
      path: "/home",
      requestId,
      durationMs: expect.any(Number),
      outcome: "ok",
    });
  });

  it("does not log private exception messages or client polling", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.mocked(apiFetch).mockRejectedValue(
      new Error("https://secret.test/?token=private"),
    );
    await expect(fetchHome()).rejects.toThrow();
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
    log.mockClear();
    await expect(fetchHome(true)).rejects.toThrow();
    expect(log).not.toHaveBeenCalled();
  });

  it("classifies timeout without exposing error details", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.mocked(apiFetch).mockRejectedValue(new ApiTimeoutError());
    await expect(fetchHome()).rejects.toBeInstanceOf(ApiTimeoutError);
    expect(JSON.parse(log.mock.calls[0][0]).outcome).toBe("timeout");
  });
});
