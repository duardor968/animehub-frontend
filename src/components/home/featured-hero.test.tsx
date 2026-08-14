import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeaturedAnime } from "@/lib/api/client";

const embla = vi.hoisted(() => ({
  selected: 0,
  scrollPrev: vi.fn(),
  scrollNext: vi.fn(),
  scrollTo: vi.fn(),
  selectedScrollSnap: vi.fn(() => embla.selected),
  on: vi.fn(),
  off: vi.fn(),
}));
const autoplay = vi.hoisted(() => ({ play: vi.fn(), stop: vi.fn() }));
const useEmblaCarousel = vi.hoisted(() => vi.fn(() => [vi.fn(), embla]));

vi.mock("embla-carousel-react", () => ({
  default: useEmblaCarousel,
}));
vi.mock("embla-carousel-autoplay", () => ({ default: () => autoplay }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={String(props.src)}
      alt={String(props.alt ?? "")}
      referrerPolicy={props.referrerPolicy as React.HTMLAttributeReferrerPolicy}
      onLoad={props.onLoad as React.ReactEventHandler<HTMLImageElement>}
      onError={props.onError as React.ReactEventHandler<HTMLImageElement>}
    />
  ),
}));

import { FeaturedHero } from "./featured-hero";

const featured = [
  {
    id: "1",
    slug: "first",
    title: "Primer anime",
    synopsis: "Primera sinopsis",
    posterUrl: "https://example.com/first.jpg",
    backdropUrl: "https://example.com/first-wide.jpg",
    category: { id: "tv", name: "TV Anime", slug: "tv-anime" },
    status: "AIRING",
    startDate: "2026-01-01T00:00:00.000Z",
    mature: false,
    genres: [{ id: "g1", name: "Acción", slug: "accion" }],
    episodeCount: 12,
    trailerUrl: "https://example.com/trailer",
  },
  {
    id: "2",
    slug: "second",
    title: "Segundo anime",
    synopsis: "Segunda sinopsis",
    posterUrl: "https://example.com/second.jpg",
    backdropUrl: "https://example.com/second-wide.jpg",
    category: { id: "movie", name: "Película", slug: "pelicula" },
    status: "FINISHED",
    startDate: "2025-01-01T00:00:00.000Z",
    mature: false,
    genres: [],
    episodeCount: 1,
    trailerUrl: null,
  },
] as FeaturedAnime[];

describe("FeaturedHero", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loops, autoplays, supports keyboard navigation and can be paused", () => {
    render(<FeaturedHero anime={featured} />);

    const carousel = screen.getByRole("region", { name: "Destacados" });
    fireEvent.keyDown(carousel, { key: "ArrowLeft" });
    fireEvent.keyDown(carousel, { key: "ArrowRight" });
    fireEvent.click(
      screen.getByRole("button", { name: "Mostrar Segundo anime" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Pausar carrusel" }));

    expect(useEmblaCarousel).toHaveBeenCalledWith(
      expect.objectContaining({ loop: true }),
      [autoplay],
    );
    expect(embla.scrollPrev).toHaveBeenCalledOnce();
    expect(embla.scrollNext).toHaveBeenCalledOnce();
    expect(embla.scrollTo).toHaveBeenCalledWith(1);
    expect(autoplay.stop).toHaveBeenCalledOnce();
  });
});
