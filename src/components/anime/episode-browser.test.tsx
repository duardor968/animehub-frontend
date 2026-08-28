/* eslint-disable @next/next/no-img-element -- the real component uses next/image; this test double only exposes alt text */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Episode } from "@/lib/api/client";
import { EpisodeBrowser } from "./episode-browser";

vi.mock("../anime-image", () => ({
  AnimeImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock("../downloads/download-provider", () => ({
  useDownloads: () => ({ openDownload: vi.fn() }),
}));

vi.mock("../downloads/episode-download-button", () => ({
  EpisodeDownloadButton: ({ episodeNumber }: { episodeNumber: number }) => (
    <button>Descargar episodio {episodeNumber}</button>
  ),
}));

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(cleanup);

const episode: Episode = {
  id: "episode-2",
  number: 2,
  title: "Episodio 2",
  imageUrl: "/episode-2.jpg",
  publishedAt: "2026-08-26T12:00:00.000Z",
};

describe("EpisodeBrowser", () => {
  it("keeps the original corner glyph and selected styling while masking the seam", () => {
    const { container } = render(
      <EpisodeBrowser
        slug="otome-kaijuu-carameliser"
        title="Otome Kaijuu Caraméliser"
        initial={[episode]}
        totalRecords={1}
      />,
    );

    const selector = screen.getByRole("checkbox", {
      name: "Seleccionar episodio 2",
    });
    const card = container.querySelector(".episode-card-clip");

    expect(card).toBeTruthy();
    expect(card).not.toHaveClass("overflow-hidden");
    expect(container.querySelector(".lucide-square")).toBeTruthy();
    expect(container.querySelector(".ring-inset")).toBeNull();

    fireEvent.click(selector);

    expect(
      screen.getByRole("checkbox", { name: "Quitar episodio 2" }),
    ).toBeChecked();
    expect(screen.getByText("1 seleccionado")).toBeVisible();
    expect(container.querySelector(".lucide-check")).toBeTruthy();
    expect(container.querySelector(".ring-inset")).toBeNull();

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Quitar episodio 2" }),
    );

    expect(
      screen.getByRole("checkbox", { name: "Seleccionar episodio 2" }),
    ).not.toBeChecked();
  });
});
