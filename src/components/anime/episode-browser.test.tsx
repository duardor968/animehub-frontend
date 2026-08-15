import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EpisodeBrowser } from "./episode-browser";

vi.mock("../anime-image", () => ({
  AnimeImage: () => <div data-testid="anime-image" />,
}));

vi.mock("../downloads/download-provider", () => ({
  useDownloads: () => ({ openDownload: vi.fn() }),
}));

vi.mock("../downloads/episode-download-button", () => ({
  EpisodeDownloadButton: () => null,
}));

describe("EpisodeBrowser", () => {
  it("selects every visible episode when the checkbox square is clicked", () => {
    render(
      <EpisodeBrowser
        slug="anime"
        title="Anime"
        initial={[
          { id: "episode-1", number: 1, title: "Uno" },
          { id: "episode-2", number: 2, title: "Dos" },
        ]}
        totalRecords={2}
      />,
    );

    const selectAll = screen.getByRole("checkbox", {
      name: "Seleccionar todo",
    });
    const content = document.querySelector<HTMLElement>(
      '[data-slot="checkbox-content"]',
    );
    const control = document.querySelector<HTMLElement>(
      '[data-slot="checkbox-control"]',
    );

    expect(content).toContainElement(control);
    expect(control).not.toBeNull();
    fireEvent.click(selectAll);

    expect(selectAll).toBeChecked();
    expect(screen.getByText("2 seleccionados")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Quitar episodio 1" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Quitar episodio 2" }),
    ).toBeChecked();
  });
});
