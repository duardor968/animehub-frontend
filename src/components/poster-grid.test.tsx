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
    render(<PosterGrid anime={[anime]} />);

    expect(screen.getByRole("link", { name: "Ver Mob Sekai" })).toBeTruthy();
    expect(
      screen.queryByRole("link", {
        name: /Una sinopsis que no debe formar parte/,
      }),
    ).toBeNull();
  });
});
