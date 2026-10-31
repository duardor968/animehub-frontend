import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecentEpisodes } from "./recent-episodes";

vi.mock("../downloads/episode-download-button", () => ({
  EpisodeDownloadButton: () => <button type="button">Descargar</button>,
}));

afterEach(cleanup);

describe("RecentEpisodes cards", () => {
  const episodes = [
    {
      anime: {
        id: "1",
        slug: "a",
        title: "Show A",
        status: "AIRING" as const,
        mature: false,
      },
      episode: {
        id: "e1",
        number: 3,
        title: null,
        publishedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      },
    },
    {
      anime: {
        id: "2",
        slug: "b",
        title: "Show B",
        status: "AIRING" as const,
        mature: false,
      },
      episode: { id: "e2", number: 4, title: "El regreso", publishedAt: null },
    },
  ];

  it("names each card with the anime, episode and publish time", () => {
    render(<RecentEpisodes episodes={episodes} />);
    expect(
      screen.getByRole("link", { name: "Show A, episodio 3, hace 2 h" }),
    ).toHaveAttribute("href", "/anime/a#episodio-3");
    expect(
      screen.getByRole("link", { name: "Show B, episodio 4: El regreso" }),
    ).toBeInTheDocument();
  });

  it("labels the still with the episode number, linked like any anime card", () => {
    const { container } = render(<RecentEpisodes episodes={episodes} />);
    expect(container.querySelectorAll(".media-card")).toHaveLength(2);
    expect(container.querySelector(".media-label")).toHaveTextContent("EP 3");
    expect(
      screen.getByRole("link", { name: "Show A, episodio 3, hace 2 h" }),
    ).not.toContainElement(screen.getAllByRole("button")[0]);
  });

  it("shows the publish time instead of repeating the episode badge", () => {
    render(<RecentEpisodes episodes={episodes} />);
    expect(screen.getByText("hace 2 h")).toBeInTheDocument();
    expect(screen.queryByText("Episodio 3")).toBeNull();
    expect(screen.getByText("El regreso")).toBeInTheDocument();
  });

  it("links a finished series to its newest episodes", () => {
    render(
      <RecentEpisodes
        episodes={[
          {
            ...episodes[1],
            anime: { ...episodes[1].anime, status: "FINISHED" as const },
          },
        ]}
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/anime/b?orden=recientes#episodio-4",
    );
  });

  it("makes one card of consecutive episodes of one anime", () => {
    const show = (number: number) => ({
      anime: episodes[0].anime,
      episode: {
        id: `a${number}`,
        number,
        title: `T${number}`,
        publishedAt: null,
      },
    });
    const { container } = render(
      <RecentEpisodes
        episodes={[show(3), show(2), show(1), episodes[1], show(9)]}
      />,
    );
    const cards = container.querySelectorAll(".media-card");
    expect(cards).toHaveLength(3);
    expect(cards[0].querySelector(".media-label")).toHaveTextContent("EP 1–3");
    expect(
      screen.getByRole("link", { name: "Show A, episodios 1–3" }),
    ).toHaveAttribute("href", "/anime/a#episodio-3");
    // Not next to the others in the list: a card of its own.
    expect(cards[2].querySelector(".media-label")).toHaveTextContent("EP 9");
  });
});
