import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchBox } from "./search-box";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(cleanup);

describe("SearchBox", () => {
  it("localizes the clear control for assistive technology", () => {
    render(<SearchBox />);

    expect(
      screen.getByRole("button", { name: "Limpiar búsqueda" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });
});
