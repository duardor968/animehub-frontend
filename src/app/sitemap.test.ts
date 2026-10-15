import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";
import sitemap, { MAX_SITEMAP_URLS } from "./sitemap";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("sitemap", () => {
  it("lists the pages, the genre and format pages, and every anime with its last change", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) =>
      path === "/sitemap/anime"
        ? {
            data: [
              { slug: "one-piece", updatedAt: "2026-10-08T10:00:00.000Z" },
              { slug: "frieren", updatedAt: "2026-10-09T02:00:00.000Z" },
            ],
          }
        : {
            meta: {
              categories: [
                { slug: "pelicula", name: "Película" },
                { slug: "nuevo", name: "Nuevo" },
              ],
              genres: [{ slug: "accion", name: "Acción" }],
            },
          },
    );
    const entries = await sitemap();

    // Cacheable for an hour, like the API's Cache-Control.
    expect(apiFetch).toHaveBeenCalledWith(
      "/sitemap/anime",
      { next: { revalidate: 3_600 } },
      false,
      expect.objectContaining({ timeoutMs: 10_000 }),
    );
    // The genre and format list comes from the catalog's first page query.
    expect(apiFetch).toHaveBeenCalledWith(
      "/catalog?order=latest_added&page=1",
      { next: { revalidate: 3_600 } },
      false,
      expect.objectContaining({ timeoutMs: 10_000 }),
    );
    expect(entries.map((entry) => entry.url)).toEqual([
      "http://localhost:3000",
      "http://localhost:3000/catalogo",
      "http://localhost:3000/horario",
      "http://localhost:3000/catalogo?category=pelicula",
      "http://localhost:3000/catalogo?genre=accion",
      "http://localhost:3000/anime/one-piece",
      "http://localhost:3000/anime/frieren",
    ]);
    expect(entries[5].lastModified).toEqual(
      new Date("2026-10-08T10:00:00.000Z"),
    );
    // Home and catalog change whenever any title does.
    expect(entries[0].lastModified).toEqual(
      new Date("2026-10-09T02:00:00.000Z"),
    );
  });

  it("falls back to the static pages when the API fails", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("down"));
    const entries = await sitemap();
    expect(entries).toHaveLength(3);
    expect(entries[0].lastModified).toBeUndefined();
  });

  it("stays within the 50 000 URL limit of a sitemap file", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: Array.from({ length: MAX_SITEMAP_URLS }, (_, index) => ({
        slug: `anime-${index}`,
        updatedAt: "invalid",
      })),
    });
    const entries = await sitemap();
    expect(entries).toHaveLength(MAX_SITEMAP_URLS);
    expect(entries.at(-1)?.lastModified).toBeUndefined();
  });
});
