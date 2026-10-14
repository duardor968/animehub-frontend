import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EpisodeDownloadButton } from "./episode-download-button";

const downloads = {
  deviceProfile: "desktop",
  destination: "COPY",
  preferences: { audio: "SUB", providers: ["MEGA"], destination: "COPY" },
  getRequestStatus: vi.fn(),
  openDownload: vi.fn(),
};

vi.mock("./download-provider", () => ({ useDownloads: () => downloads }));
vi.mock("./episode-copy-menu", () => ({
  EpisodeCopyMenu: () => <button type="button">Menú de copia</button>,
}));

beforeEach(() => {
  downloads.openDownload.mockReset();
  downloads.preferences.providers = ["MEGA"];
});

afterEach(cleanup);

const renderButton = () =>
  render(
    <EpisodeDownloadButton
      slug="one-piece"
      title="One Piece"
      episodeNumber={5}
    />,
  );

describe("EpisodeDownloadButton", () => {
  it("copies at once with one server: a ring would repeat its center", () => {
    renderButton();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Copiar enlaces del episodio 5 de One Piece",
      }),
    );
    expect(downloads.openDownload).toHaveBeenCalledWith({
      slug: "one-piece",
      title: "One Piece",
      episodeNumbers: [5],
    });
  });

  it("offers the copy menu with several servers", () => {
    downloads.preferences.providers = ["MEGA", "PIXELDRAIN"];
    renderButton();
    expect(
      screen.getByRole("button", { name: "Menú de copia" }),
    ).toBeInTheDocument();
  });
});
