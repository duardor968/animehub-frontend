import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pagination, paginationItems } from "./pagination";

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
  it.each([
    [1, 0],
    [1, 1],
    [51, 50],
  ])("renders nothing for page %s of %s", (page, totalPages) => {
    render(<Pagination page={page} totalPages={totalPages} />);

    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("uses buttons without href and marks the current page", () => {
    const onChange = vi.fn();
    render(<Pagination page={1} totalPages={3} onChange={onChange} />);

    const current = screen
      .getByRole("navigation")
      .querySelector('[aria-current="page"]');
    expect(current).toHaveTextContent("1");
    expect(current).toHaveAttribute("data-active", "true");
    expect(
      screen.getByLabelText("Página anterior").closest("[aria-disabled]"),
    ).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("marks the page being loaded without resizing the arrow", () => {
    render(<Pagination page={1} totalPages={3} pendingPage={2} />);

    // The number spins; the arrow keeps its label (phones show the spinner
    // over it, since they hide the numbers).
    expect(screen.getByLabelText("Página 2")).not.toHaveTextContent("2");
    const next = screen.getByLabelText("Página siguiente");
    expect(next).toHaveAttribute("aria-busy", "true");
    expect(next).toHaveTextContent("Siguiente");
  });
});
