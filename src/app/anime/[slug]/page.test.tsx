import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadAnime } from "@/lib/api/anime";
import {
  ApiResponseError,
  apiFetch,
  type AnimeResponse,
  type EpisodePageResponse,
} from "@/lib/api/client";
import AnimePage, { generateMetadata } from "./page";

vi.mock("@/lib/api/anime", () => ({ loadAnime: vi.fn() }));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiFetch: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const anime: AnimeResponse = {
  data: {
    id: "naruto",
    slug: "naruto-shippuuden",
    title: "Naruto Shippuuden",
    synopsis: "An anime synopsis.",
    status: "FINISHED",
    mature: false,
    sourceUrl: "https://animeav1.com/media/naruto-shippuuden",
    genres: [],
    relations: [],
    incomingRelations: [],
  },
  meta: {
    fetchedAt: "2026-10-26T12:00:00.000Z",
    nextRefreshAt: "2026-10-27T12:00:00.000Z",
    stale: false,
  },
};
const episodes: EpisodePageResponse = {
  data: [{ id: "episode-151", number: 151 }],
  meta: {
    page: 4,
    perPage: 50,
    totalPages: 10,
    totalRecords: 500,
    firstNumber: 1,
    lastNumber: 500,
  },
};
const props = (page?: string | string[]) => ({
  params: Promise.resolve({ slug: anime.data.slug }),
  searchParams: Promise.resolve({ page }),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadAnime).mockResolvedValue(anime);
  vi.mocked(apiFetch).mockResolvedValue(episodes);
});

describe("anime episode page metadata", () => {
  it.each([
    [undefined, "", 1],
    ["1", "", 1],
    ["invalid", "", 1],
    ["-3", "", 1],
    ["4", "?page=4", 4],
    [["4", "8"], "?page=4", 4],
  ] as [string | string[] | undefined, string, number][])(
    "canonicalizes page %s to the rendered page",
    async (raw, suffix, page) => {
      const metadata = await generateMetadata(props(raw));
      expect(metadata.alternates?.canonical).toBe(
        `/anime/naruto-shippuuden${suffix}`,
      );
      expect(metadata.openGraph?.url).toBe(metadata.alternates?.canonical);
      expect(apiFetch).toHaveBeenCalledWith(
        `/anime/naruto-shippuuden/episodes?page=${page}`,
      );
    },
  );

  it("does not create a canonical for an unknown anime", async () => {
    vi.mocked(loadAnime).mockResolvedValue(null);
    expect(await generateMetadata(props("4"))).toEqual({
      title: "Anime no encontrado",
    });
    expect(apiFetch).not.toHaveBeenCalled();
    await expect(AnimePage(props("4"))).rejects.toThrow("not-found");
  });

  describe.each([generateMetadata, AnimePage])("%s", (render) => {
    it("redirects an out-of-range page instead of emitting its canonical", async () => {
      await expect(render(props("10000"))).rejects.toThrow(
        "redirect:/anime/naruto-shippuuden?page=10#episodios",
      );
      expect(apiFetch).toHaveBeenCalledWith(
        "/anime/naruto-shippuuden/episodes?page=1000",
      );
    });

    it("keeps the fallback redirect for a rejected episode page", async () => {
      vi.mocked(apiFetch).mockRejectedValue(new ApiResponseError(400, "page"));
      await expect(render(props("4"))).rejects.toThrow(
        "redirect:/anime/naruto-shippuuden#episodios",
      );
    });

    it("preserves missing episodes as 404 and propagates service failures", async () => {
      vi.mocked(apiFetch).mockRejectedValue(
        new ApiResponseError(404, "missing"),
      );
      await expect(render(props("4"))).rejects.toThrow("not-found");
      const unavailable = new ApiResponseError(503, "unavailable");
      vi.mocked(apiFetch).mockRejectedValue(unavailable);
      await expect(render(props("4"))).rejects.toBe(unavailable);
    });
  });
});
