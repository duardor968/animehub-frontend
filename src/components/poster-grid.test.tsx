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

  it("gives each card one concise accessible name", () => {
    const { container } = render(<PosterGrid anime={[anime]} />);

    expect(screen.getByRole("link", { name: "Ver Mob Sekai" })).toBeTruthy();
    expect(
      screen.queryByRole("link", {
        name: /Una sinopsis que no debe formar parte/,
      }),
    ).toBeNull();
    expect(container.firstElementChild).toHaveClass(
      "max-w-[1152px]",
      "px-2",
      "grid-cols-5",
      "max-xl:grid-cols-4",
      "max-lg:grid-cols-3",
      "max-sm:grid-cols-2",
    );
  });

  it("eager-loads the desktop catalog row that can become LCP", () => {
    const items = Array.from({ length: 6 }, (_, index) => ({
      ...anime,
      id: `anime-${index}`,
      slug: `anime-${index}`,
      title: `Anime ${index}`,
    }));
    const { container } = render(<PosterGrid anime={items} />);
    const images = [...container.querySelectorAll("img")];

    expect(
      images
        .slice(0, 5)
        .every((image) => image.getAttribute("loading") === "eager"),
    ).toBe(true);
    expect(images[5]).toHaveAttribute("loading", "lazy");
  });
});
