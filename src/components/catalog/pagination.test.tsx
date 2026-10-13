import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogNavigationContext } from "./catalog-navigation";
import { Pagination } from "./pagination";

vi.mock("next/navigation", () => ({ usePathname: () => "/catalogo" }));

afterEach(cleanup);

describe("catalog Pagination", () => {
  it("renders crawlable links that keep the query", () => {
    render(<Pagination page={7} totalPages={50} query="genre=accion&page=7" />);

    const list = within(screen.getByRole("navigation")).getByRole("list");
    expect(
      within(list).getByRole("link", { name: "Página 1" }),
    ).toHaveAttribute("href", "/catalogo?genre=accion");
    expect(
      within(list).getByRole("link", { name: "Página 50" }),
    ).toHaveAttribute("href", "/catalogo?genre=accion&page=50");
    expect(
      within(list).getByRole("link", { name: "Página siguiente" }),
    ).toHaveAttribute("href", "/catalogo?genre=accion&page=8");
  });

  it("pages inside the catalog transition, and ignores clicks while loading", () => {
    const navigate = vi.fn();
    const { rerender } = render(
      <CatalogNavigationContext value={{ navigate, isPending: false }}>
        <Pagination page={2} totalPages={50} query="page=2" />
      </CatalogNavigationContext>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Página 3" }));
    // Paging scrolls up and hands keyboard focus to the new results.
    expect(navigate).toHaveBeenLastCalledWith("/catalogo?page=3", {
      scroll: true,
      focusResults: true,
    });

    rerender(
      <CatalogNavigationContext value={{ navigate, isPending: true }}>
        <Pagination page={2} totalPages={50} query="page=2" />
      </CatalogNavigationContext>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Página 4" }));
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
