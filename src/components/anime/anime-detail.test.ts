import { describe, expect, it } from "vitest";
import {
  animePagePath,
  defaultEpisodeOrder,
  loadEpisodes,
  MAX_EPISODE_PAGE,
  newestFirstSlice,
  parseEpisodeOrder,
  parseEpisodePage,
} from "./anime-detail";

describe("parseEpisodePage", () => {
  it("never asks the API past its maximum page", () => {
    expect(parseEpisodePage("1001", MAX_EPISODE_PAGE)).toBe(1_000);
    expect(parseEpisodePage("100000", MAX_EPISODE_PAGE)).toBe(1_000);
    expect(parseEpisodePage("abc", MAX_EPISODE_PAGE)).toBe(1);
    expect(parseEpisodePage("-3", MAX_EPISODE_PAGE)).toBe(1);
    expect(parseEpisodePage("4", MAX_EPISODE_PAGE)).toBe(4);
  });
});

describe("newest-first pages", () => {
  it("takes each page from the API's ascending pages", () => {
    // 120 episodes: newest-first page 1 is 120…71 (API pages 2 and 3).
    expect(newestFirstSlice(1, 120)).toEqual({
      pages: [2, 3],
      offset: 20,
      count: 50,
    });
    // The last one is what's left: 20…1.
    expect(newestFirstSlice(3, 120)).toEqual({
      pages: [1],
      offset: 0,
      count: 20,
    });
    expect(newestFirstSlice(1, 100)).toEqual({
      pages: [2],
      offset: 0,
      count: 50,
    });
  });

  it("reverses the slice and leaves the first episodes order alone", async () => {
    const fetchPage = async (page: number) =>
      Array.from(
        { length: Math.min(50, 120 - (page - 1) * 50) },
        (_, index) => (page - 1) * 50 + index + 1,
      );
    const newest = await loadEpisodes(1, "desc", 120, fetchPage);
    expect(newest[0]).toBe(120);
    expect(newest.at(-1)).toBe(71);
    expect(await loadEpisodes(2, "asc", 120, fetchPage)).toEqual(
      await fetchPage(2),
    );
  });

  it("writes the order in the URL only when it isn't the work's default", () => {
    expect(defaultEpisodeOrder("AIRING", 3)).toBe("desc");
    expect(defaultEpisodeOrder("AIRING", 1)).toBe("asc");
    expect(defaultEpisodeOrder("FINISHED", 3)).toBe("asc");
    expect(defaultEpisodeOrder("PAUSED", 3)).toBe("desc");
    expect(animePagePath("x", 2, { value: "desc", default: "desc" })).toBe(
      "/anime/x?page=2",
    );
    expect(animePagePath("x", 1, { value: "asc", default: "desc" })).toBe(
      "/anime/x?orden=primeros",
    );
    expect(parseEpisodeOrder("recientes", "asc")).toBe("desc");
    expect(parseEpisodeOrder("otra", "desc")).toBe("desc");
  });
});
