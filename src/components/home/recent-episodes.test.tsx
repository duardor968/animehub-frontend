import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecentEpisodes } from "./recent-episodes";

vi.mock("../downloads/episode-download-button", () => ({
  EpisodeDownloadButton: () => <button type="button">Descargar</button>,
}));

afterEach(cleanup);

describe("RecentEpisodes", () => {
  it("explains an empty recent feed and links to the schedule", () => {
    render(<RecentEpisodes episodes={[]} />);

    expect(
      screen.getByRole("region", { name: "Aún no hay episodios recientes" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver horario/i })).toHaveAttribute(
      "href",
      "/horario",
    );
  });
});

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
    ).toHaveAttribute("href", "/anime/a");
    expect(
      screen.getByRole("link", { name: "Show B, episodio 4: El regreso" }),
    ).toBeInTheDocument();
  });

  it("shows the publish time instead of repeating the episode badge", () => {
    render(<RecentEpisodes episodes={episodes} />);
    expect(screen.getByText("hace 2 h")).toBeInTheDocument();
    expect(screen.queryByText("Episodio 3")).toBeNull();
    expect(screen.getByText("El regreso")).toBeInTheDocument();
  });
});
