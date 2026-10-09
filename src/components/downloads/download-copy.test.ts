import { describe, expect, it } from "vitest";
import {
  describeAudioFallback,
  describeEpisodes,
  describeFailed,
  describeLinks,
  formatEpisodeRanges,
  requestEpisodeCount,
  requestKey,
} from "./download-copy";

const episode = (episodeNumber: number, links = 1, audio = "SUB" as const) => ({
  episodeNumber,
  audio,
  links: Array.from({ length: links }, (_, index) => ({
    url: `https://example.com/${episodeNumber}/${index}`,
  })),
  errorCode: links ? null : "NO_SUPPORTED_LINKS",
});

describe("download copy helpers", () => {
  it("keys equivalent requests the same way", () => {
    expect(
      requestKey({ slug: "a", title: "A", episodeNumbers: [3, 1, 1] }),
    ).toBe(requestKey({ slug: "a", title: "A", episodeNumbers: [1, 3] }));
    expect(requestKey({ slug: "a", title: "A", from: 1, to: 5 })).not.toBe(
      requestKey({ slug: "a", title: "A", all: true }),
    );
  });

  it("compresses episode numbers into ranges", () => {
    expect(formatEpisodeRanges([9, 1, 2, 3, 5, 8])).toBe("1–3, 5, 8–9");
    expect(formatEpisodeRanges([1180, 1179])).toBe("1.179–1.180");
  });

  it("describes what a request covers", () => {
    expect(
      describeEpisodes({ slug: "a", title: "A", episodeNumbers: [5] }),
    ).toBe("Ep. 5");
    expect(describeEpisodes({ slug: "a", title: "A", from: 1, to: 50 })).toBe(
      "Ep. 1–50",
    );
    expect(
      describeEpisodes({ slug: "a", title: "A", all: true, total: 1180 }),
    ).toBe("Todos (1.180 episodios)");
    expect(
      describeEpisodes({
        slug: "a",
        title: "A",
        episodeNumbers: [1, 3, 5, 7, 9],
      }),
    ).toBe("5 episodios");
    expect(requestEpisodeCount({ slug: "a", title: "A", from: 4, to: 9 })).toBe(
      6,
    );
  });

  it("explains mirrors, failures and audio fallbacks with plurals", () => {
    expect(describeLinks([episode(1, 2)])).toBe(
      "2 enlaces (espejos) de 1 episodio",
    );
    expect(describeLinks([episode(1), episode(2)])).toBe(
      "2 enlaces de 2 episodios",
    );
    expect(describeFailed([2])).toBe("El episodio 2 no tiene enlaces.");
    expect(describeFailed([1, 2, 3, 7])).toBe("Sin enlaces: episodios 1–3, 7.");
    expect(describeAudioFallback([episode(1, 1, "DUB" as never)], "SUB")).toBe(
      "1 episodio en doblado (DUB): no había SUB.",
    );
  });
});
