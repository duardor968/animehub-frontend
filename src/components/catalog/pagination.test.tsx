import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Pagination } from "./pagination";

afterEach(cleanup);

describe("Pagination", () => {
  it.each([0, 1])(
    "does not render controls when there are %s pages",
    (totalPages) => {
      render(
        <Pagination
          page={1}
          totalPages={totalPages}
          params={new URLSearchParams("page=1")}
        />,
      );

      expect(screen.queryByRole("navigation")).toBeNull();
    },
  );

  it("does not render contradictory controls for an out-of-range page", () => {
    render(
      <Pagination
        page={51}
        totalPages={50}
        params={new URLSearchParams("page=51")}
      />,
    );

    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("renders only valid navigation when another page exists", () => {
    render(
      <Pagination
        page={1}
        totalPages={2}
        params={new URLSearchParams("genre=accion&page=1")}
      />,
    );

    expect(screen.getByRole("navigation", { name: "Paginación" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Página siguiente" }),
    ).toHaveAttribute("href", "?genre=accion&page=2");
    expect(screen.queryByRole("link", { name: "Página anterior" })).toBeNull();
  });
});
