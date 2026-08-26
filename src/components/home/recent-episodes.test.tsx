import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RecentEpisodes } from "./recent-episodes";

afterEach(cleanup);

describe("RecentEpisodes", () => {
  it("explains an empty recent feed and links to the schedule", () => {
    render(<RecentEpisodes episodes={[]} />);

    expect(
      screen.getByRole("region", { name: "Aún no hay episodios recientes" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver horario/i })).toHaveAttribute(
      "href",
      "/horario",
    );
  });
});
