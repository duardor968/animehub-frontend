import { describe, expect, it } from "vitest";
import { MAX_EPISODE_PAGE, parseEpisodePage } from "./anime-detail";

describe("parseEpisodePage", () => {
  it("never asks the API past its maximum page", () => {
    expect(parseEpisodePage("1001", MAX_EPISODE_PAGE)).toBe(1_000);
    expect(parseEpisodePage("100000", MAX_EPISODE_PAGE)).toBe(1_000);
    expect(parseEpisodePage("abc", MAX_EPISODE_PAGE)).toBe(1);
    expect(parseEpisodePage("-3", MAX_EPISODE_PAGE)).toBe(1);
    expect(parseEpisodePage("4", MAX_EPISODE_PAGE)).toBe(4);
  });
});
