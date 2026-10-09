import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AnimeSummary } from "@/lib/api/client";
import { PosterGrid } from "./poster-grid";

afterEach(cleanup);

const anime: AnimeSummary = {
  id: "anime-1",
  slug: "mob-sekai",
  title: "Mob Sekai",
  synopsis: "Una sinopsis que no debe formar parte del nombre accesible.",
  posterUrl: "/poster.jpg",
  category: { id: "tv", slug: "tv-anime", name: "TV Anime" },
  status: "AIRING",
  startDate: "2026-01-01T00:00:00.000Z",
  mature: false,
};

describe("PosterGrid", () => {
  it("shows a contextual empty state and action", () => {
    render(
      <PosterGrid
        anime={[]}
        emptyState={{
          title: "Ninguna obra coincide",
          description: "Prueba quitando algunos filtros.",
          action: { href: "/catalogo", label: "Limpiar filtros" },
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Ninguna obra coincide" }),
    ).toBeTruthy();
    expect(screen.getByText("Prueba quitando algunos filtros.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Limpiar filtros" }),
    ).toHaveAttribute("href", "/catalogo");
  });

  it("names each card with its title, category and year, not the synopsis", () => {
    const { container } = render(<PosterGrid anime={[anime]} />);

    expect(
      screen.getByRole("link", { name: "Mob Sekai, TV Anime, 2026" }),
    ).toHaveAttribute("href", "/anime/mob-sekai");
    expect(
      screen.queryByRole("link", {
        name: /Una sinopsis que no debe formar parte/,
      }),
    ).toBeNull();
    // Fills the page container (no own width cap or inset).
    expect(container.firstElementChild).not.toHaveClass("max-w-[1152px]");
    expect(container.firstElementChild).not.toHaveClass("px-2");
    expect(container.firstElementChild).toHaveClass(
      "grid-cols-2",
      "sm:grid-cols-3",
      "lg:grid-cols-4",
      "xl:grid-cols-5",
      "2xl:grid-cols-6",
    );
  });

  it("does not repeat the title in the hover panel", () => {
    render(<PosterGrid anime={[anime]} />);
    // Title once (below the poster); the panel shows synopsis and facts.
    expect(screen.getAllByText("Mob Sekai")).toHaveLength(1);
    expect(screen.getByText("2026 · En emisión")).toBeInTheDocument();
  });

  it("prioritizes only the first catalog posters and keeps home posters lazy", () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      ...anime,
      id: `anime-${index}`,
      slug: `anime-${index}`,
      title: `Anime ${index}`,
    }));
    const { container, unmount } = render(<PosterGrid anime={items} />);
    const images = [...container.querySelectorAll("img")];

    // The rest of a desktop first row is eager but low priority, so phones
    // (two columns) don't preload or prioritize posters below the fold.
    expect(images.map((image) => image.getAttribute("fetchpriority"))).toEqual([
      "high",
      "high",
      "low",
      "low",
      "low",
      "low",
      null,
      null,
    ]);
    expect(images.map((image) => image.getAttribute("loading"))).toEqual([
      "eager",
      "eager",
      "eager",
      "eager",
      "eager",
      "eager",
      "lazy",
      "lazy",
    ]);
    unmount();

    const home = render(<PosterGrid anime={items} variant="home" />);
    expect(
      [...home.container.querySelectorAll("img")].every(
        (image) =>
          image.getAttribute("loading") === "lazy" &&
          !image.hasAttribute("fetchpriority"),
      ),
    ).toBe(true);
  });
});
