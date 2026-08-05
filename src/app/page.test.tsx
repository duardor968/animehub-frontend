import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("presents the AnimeHub foundation", () => {
    render(<Home />);

    expect(screen.getByText("AnimeHub")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /anime,\s*sin fricción/i }),
    ).toBeInTheDocument();
  });
});
