import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Brand } from "@/components/brand";

describe("Brand", () => {
  it("provides one accessible route home", () => {
    render(<Brand />);

    expect(
      screen.getByRole("link", { name: "AnimeHub, inicio" }),
    ).toHaveAttribute("href", "/");
    expect(screen.getByRole("img", { name: "AnimeHub" })).toBeInTheDocument();
  });
});
