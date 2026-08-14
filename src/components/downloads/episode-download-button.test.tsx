import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EpisodeDownloadButton } from "./episode-download-button";

const mocks = vi.hoisted(() => ({
  getEpisodeStatus: vi.fn(),
  openDownload: vi.fn(),
}));

vi.mock("./download-provider", () => ({
  useDownloads: () => mocks,
}));

describe("EpisodeDownloadButton", () => {
  beforeEach(() => {
    mocks.getEpisodeStatus.mockReset();
    mocks.openDownload.mockReset();
  });

  it("stays visible after hover ends while the episode is processing", () => {
    mocks.getEpisodeStatus.mockReturnValue("resolving");

    render(
      <EpisodeDownloadButton
        slug="anime"
        title="Anime"
        episodeNumber={2}
        className="scale-90 opacity-0"
      />,
    );

    const button = screen.getByRole("button", {
      name: /Descargar episodio 2 de Anime/,
    });
    expect(button).toHaveAttribute("data-pending", "true");
    expect(button).toHaveStyle({ opacity: "1", transform: "scale(1)" });
    expect(
      screen.getByRole("progressbar", { name: "Preparando descarga" }),
    ).toBeInTheDocument();
  });
});
