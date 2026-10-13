import { describe, expect, it } from "vitest";
import {
  describeAudioFallback,
  describeConfirmation,
  describeEpisodes,
  describeFailed,
  describeMissing,
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
    expect(formatEpisodeRanges([1180, 1179])).toBe("1179–1180");
    // A decimal special uses the decimal comma, so runs split with "; ".
    expect(formatEpisodeRanges([13, 12.5, 12])).toBe("12; 12,5; 13");
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
    ).toBe("Todos (1180 episodios)");
    expect(
      describeEpisodes({
        slug: "a",
        title: "A",
        episodeNumbers: [1, 3, 5, 7, 9],
      }),
    ).toBe("5 episodios");
    // A range only counts when the caller knows the numbering has no
    // specials or gaps between its bounds.
    expect(
      requestEpisodeCount({ slug: "a", title: "A", from: 4, to: 9, total: 6 }),
    ).toBe(6);
    expect(
      requestEpisodeCount({ slug: "a", title: "A", from: 12, to: 13 }),
    ).toBe(0);
    expect(
      describeEpisodes({ slug: "a", title: "A", episodeNumbers: [12, 12.5] }),
    ).toBe("Ep. 12; 12,5");
  });

  it("counts links, failures and audio fallbacks with plurals", () => {
    expect(describeLinks([episode(1, 2)])).toBe("2 enlaces");
    expect(describeLinks([episode(1)], "MEGA")).toBe("1 enlace de Mega");
    expect(describeFailed([2])).toBe("El episodio 2 no tiene enlaces.");
    expect(describeFailed([1, 2, 3, 7])).toBe("Sin enlaces: episodios 1–3, 7.");
    expect(describeAudioFallback([episode(1, 1, "DUB" as never)], "SUB")).toBe(
      "1 episodio en doblado (DUB): no había SUB.",
    );
  });

  it("tells a source outage from missing links and skipped numbers", () => {
    const down = { ...episode(4, 0), errorCode: "SOURCE_UNAVAILABLE" };
    expect(describeFailed([4], 0, [down])).toBe(
      "AnimeAV1 no respondió para el episodio 4; puedes reintentarlo.",
    );
    expect(describeMissing([12.5])).toBe(
      "Se omitió el episodio 12,5: no existe.",
    );
    expect(describeMissing([7, 8, 9])).toBe(
      "Se omitieron los episodios 7–9: no existen.",
    );
    expect(describeMissing([])).toBe("");
  });

  it("confirms where a large download goes and that it sends every mirror", () => {
    expect(
      describeConfirmation(
        { slug: "a", title: "One Piece", from: 1, to: 50, total: 50 },
        "CNL",
        ["PIXELDRAIN", "MEGA"],
      ),
    ).toEqual({
      heading: "¿Descargar 50 episodios?",
      body: "Los enlaces de One Piece (Ep. 1–50) se enviarán a JDownloader, con todos los espejos de Mega y Pixeldrain.",
    });
    expect(
      describeConfirmation(
        { slug: "a", title: "One Piece", all: true, total: 1180 },
        "MYJD",
        ["MEGA"],
      ).heading,
    ).toBe("¿Descargar los 1180 episodios?");
  });
});
