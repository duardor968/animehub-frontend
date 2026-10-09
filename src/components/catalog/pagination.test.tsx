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
import { Pagination, paginationItems } from "./pagination";

vi.mock("next/navigation", () => ({ usePathname: () => "/catalogo" }));

afterEach(cleanup);

describe("paginationItems", () => {
  it("lists every page when they fit", () => {
    expect(paginationItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps the first and last page with a constant-size window", () => {
    expect(paginationItems(1, 50)).toEqual([1, 2, 3, 4, 5, "gap-end", 50]);
    expect(paginationItems(7, 50)).toEqual([
      1,
      "gap-start",
      6,
      7,
      8,
      "gap-end",
      50,
    ]);
    expect(paginationItems(50, 50)).toEqual([
      1,
      "gap-start",
      46,
      47,
      48,
      49,
      50,
    ]);
  });
});

describe("Pagination", () => {
  it.each([0, 1])(
    "does not render controls when there are %s pages",
    (totalPages) => {
      render(<Pagination page={1} totalPages={totalPages} query="" />);

      expect(screen.queryByRole("navigation")).toBeNull();
    },
  );

  it("does not render contradictory controls for an out-of-range page", () => {
    render(<Pagination page={51} totalPages={50} query="page=51" />);

    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("renders numbered, crawlable links with the current page marked", () => {
    render(<Pagination page={7} totalPages={50} query="genre=accion&page=7" />);

    const nav = screen.getByRole("navigation", { name: "Paginación" });
    const list = within(nav).getByRole("list");
    expect(
      within(list).getByText("7").closest("[aria-current]"),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(list).getByRole("link", { name: "Página 1" }),
    ).toHaveAttribute("href", "/catalogo?genre=accion");
    expect(
      within(list).getByRole("link", { name: "Página 50" }),
    ).toHaveAttribute("href", "/catalogo?genre=accion&page=50");
    expect(
      within(list).getByRole("link", { name: "Página siguiente" }),
    ).toHaveAttribute("href", "/catalogo?genre=accion&page=8");
    expect(
      within(nav).getByRole("textbox", { name: "Ir a la página" }),
    ).toBeTruthy();
  });

  it("has no jump field when every page is listed", () => {
    render(<Pagination page={1} totalPages={2} query="" />);

    expect(
      screen.getAllByRole("link", { name: "Página siguiente" })[0],
    ).toHaveAttribute("href", "/catalogo?page=2");
    expect(screen.queryByRole("link", { name: "Página anterior" })).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: "Ir a la página" }),
    ).toBeNull();
  });

  it("navigates inside the catalog transition and clamps jumps", () => {
    const navigate = vi.fn();
    render(
      <CatalogNavigationContext value={{ navigate, isPending: false }}>
        <Pagination page={2} totalPages={50} query="page=2" />
      </CatalogNavigationContext>,
    );
    const list = screen.getByRole("list");

    fireEvent.click(within(list).getByRole("link", { name: "Página 3" }));
    // Paging scrolls up and hands keyboard focus to the new results.
    expect(navigate).toHaveBeenLastCalledWith("/catalogo?page=3", {
      scroll: true,
      focusResults: true,
    });

    const field = screen.getByRole("textbox", { name: "Ir a la página" });
    fireEvent.change(field, { target: { value: "120" } });
    fireEvent.submit(field.closest("form")!);
    expect(navigate).toHaveBeenLastCalledWith("/catalogo?page=50", {
      scroll: true,
      focusResults: true,
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Ir a la página" }), {
      target: { value: "1" },
    });
    expect(navigate).toHaveBeenLastCalledWith("/catalogo", {
      scroll: true,
      focusResults: true,
    });
  });

  it("keeps its controls focusable while a page loads", () => {
    const navigate = vi.fn();
    render(
      <CatalogNavigationContext value={{ navigate, isPending: true }}>
        <Pagination page={2} totalPages={50} query="page=2" />
      </CatalogNavigationContext>,
    );
    const picker = screen.getByRole("combobox", { name: "Ir a la página" });
    // Disabling the focused control would drop focus to <body>.
    expect(picker).not.toBeDisabled();
    expect(picker).toHaveClass("text-base");
    expect(screen.getByRole("button", { name: "Ir" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    fireEvent.change(picker, { target: { value: "5" } });
    fireEvent.click(screen.getByRole("link", { name: "Página 3" }));
    expect(navigate).not.toHaveBeenCalled();
  });
});
