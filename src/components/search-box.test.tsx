import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchBox } from "./search-box";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

beforeEach(() => push.mockReset());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SearchBox", () => {
  it("shows the active search query and follows route updates", () => {
    const { rerender } = render(<SearchBox initialQuery="naruto" />);

    expect(screen.getByRole("combobox", { name: "Buscar anime" })).toHaveValue(
      "naruto",
    );

    rerender(<SearchBox initialQuery="bleach" />);
    expect(screen.getByRole("combobox", { name: "Buscar anime" })).toHaveValue(
      "bleach",
    );
  });

  it("localizes the clear control for assistive technology", () => {
    render(<SearchBox />);

    expect(
      screen.getByRole("button", { name: "Limpiar búsqueda" }),
    ).toHaveClass("mr-[9.5px]");
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("keeps combobox options out of the tab order and supports keyboard selection", () => {
    render(<SearchBox />);
    const input = screen.getByRole("combobox", { name: "Buscar anime" });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "naruto" } });
    const option = screen.getByRole("option", { name: /Buscar “naruto”/ });
    expect(option).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", option.id);
    fireEvent.keyDown(input, { key: "Enter" });

    expect(push).toHaveBeenCalledWith("/buscar?q=naruto");
  });
});
