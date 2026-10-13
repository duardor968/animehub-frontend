import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EpisodeLinks } from "./download-provider";
import { EpisodeCopyMenu, sectorForArrow } from "./episode-copy-menu";

const links: EpisodeLinks = {
  packageName: "One Piece",
  episode: {
    episodeNumber: 5,
    audio: "SUB",
    links: [
      { provider: "MEGA", url: "https://mega.example/5" },
      { provider: "PIXELDRAIN", url: "https://pixeldrain.example/5" },
    ],
  },
};

const downloads = {
  preferences: {
    audio: "SUB",
    providers: ["MEGA", "PIXELDRAIN", "MP4UPLOAD", "ONE_FICHIER"],
    destination: "COPY",
  },
  cachedEpisodeLinks: vi.fn(),
  resolveEpisodeLinks: vi.fn(),
  copyEpisodeLinks: vi.fn(),
};

vi.mock("./download-provider", () => ({ useDownloads: () => downloads }));

const request = { slug: "one-piece", title: "One Piece", episodeNumbers: [5] };

beforeEach(() => {
  downloads.cachedEpisodeLinks.mockReset().mockReturnValue(undefined);
  downloads.resolveEpisodeLinks.mockReset().mockResolvedValue(links);
  downloads.copyEpisodeLinks.mockReset();
});

afterEach(cleanup);

function renderMenu() {
  render(
    <EpisodeCopyMenu
      slug="one-piece"
      title="One Piece"
      episodeNumber={5}
      withSeries
      className=""
      portable={false}
    />,
  );
  return screen.getByRole("button", {
    name: "Copiar enlaces del episodio 5 de One Piece",
  });
}

describe("sectorForArrow", () => {
  it("maps arrows to the sector in that direction", () => {
    // Four: top, right, bottom, left.
    expect(
      ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].map((key) =>
        sectorForArrow(key, 4, null),
      ),
    ).toEqual([0, 1, 2, 3]);
    // Three at 120°: top, lower right, lower left; down is a tie.
    expect(sectorForArrow("ArrowUp", 3, null)).toBe(0);
    expect(sectorForArrow("ArrowRight", 3, null)).toBe(1);
    expect(sectorForArrow("ArrowLeft", 3, null)).toBe(2);
    expect(sectorForArrow("ArrowDown", 3, 2)).toBe(2);
    // Two: top and bottom halves.
    expect(sectorForArrow("ArrowDown", 2, null)).toBe(1);
  });
});

describe("EpisodeCopyMenu", () => {
  it("opens with an arrow, marks what each server has and copies one", async () => {
    const trigger = renderMenu();
    fireEvent.keyDown(trigger, { key: "ArrowRight" });

    const menu = await screen.findByRole("menu", {
      name: "Copiar enlaces del episodio 5 de One Piece",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(downloads.resolveEpisodeLinks).toHaveBeenCalledWith(request);
    const pixeldrain = await screen.findByRole("menuitem", {
      name: "Copiar el enlace de Pixeldrain",
    });
    await waitFor(() => expect(pixeldrain).toHaveFocus());
    expect(menu).toHaveAttribute("aria-busy", "false");
    expect(
      screen.getByRole("menuitem", {
        name: "MP4Upload no tiene este episodio",
      }),
    ).toHaveAttribute("aria-disabled", "true");

    // Arrows and Home/End skip the sectors without links: down from
    // Pixeldrain stays there (MP4Upload, below, has none).
    fireEvent.keyDown(pixeldrain, { key: "ArrowDown" });
    expect(pixeldrain).toHaveFocus();
    fireEvent.keyDown(pixeldrain, { key: "Home" });
    const mega = screen.getByRole("menuitem", { name: /Mega/ });
    expect(mega).toHaveFocus();
    fireEvent.keyDown(mega, { key: "End" });
    expect(pixeldrain).toHaveFocus();
    fireEvent.click(
      screen.getByRole("menuitem", {
        name: "MP4Upload no tiene este episodio",
      }),
    );
    expect(downloads.copyEpisodeLinks).not.toHaveBeenCalled();

    fireEvent.click(mega);
    expect(downloads.copyEpisodeLinks).toHaveBeenCalledWith(
      request,
      links,
      "MEGA",
    );
    // Copying closes it and focus goes back to the button.
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("shows the lookup in progress and copies everything from the center", async () => {
    let finish!: (value: EpisodeLinks) => void;
    downloads.resolveEpisodeLinks.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const trigger = renderMenu();
    fireEvent.keyDown(trigger, { key: "ArrowUp" });

    expect(await screen.findByRole("menu")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(
      screen.getByRole("menuitem", { name: "Buscando el enlace de Mega…" }),
    ).toHaveAttribute("aria-disabled", "true");

    await act(async () => finish(links));
    expect(
      await screen.findByRole("menuitem", { name: "Copiar el enlace de Mega" }),
    ).not.toHaveAttribute("aria-disabled");

    fireEvent.click(trigger);
    expect(downloads.copyEpisodeLinks).toHaveBeenCalledWith(
      request,
      links,
      undefined,
    );
  });

  it("opens at once from the cache after a pause on the button", async () => {
    downloads.cachedEpisodeLinks.mockReturnValue(links);
    const trigger = renderMenu();
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    fireEvent.pointerMove(trigger, { pointerType: "mouse" });

    expect(
      await screen.findByRole("menuitem", { name: "Copiar el enlace de Mega" }),
    ).toBeInTheDocument();
    expect(downloads.resolveEpisodeLinks).not.toHaveBeenCalled();
  });

  it("opens on keyboard focus and Escape returns to the button, closed", async () => {
    const trigger = renderMenu();
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => trigger.focus());

    expect(await screen.findByRole("menu")).toBeInTheDocument();
    // Left has no link (1Fichier): the nearest sector with one takes it.
    fireEvent.keyDown(trigger, { key: "ArrowLeft" });
    await waitFor(() =>
      expect(
        screen.getByRole("menuitem", { name: "Copiar el enlace de Mega" }),
      ).toHaveFocus(),
    );
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes without a ring when the episode has no links", async () => {
    downloads.resolveEpisodeLinks.mockResolvedValue(null);
    const trigger = renderMenu();
    fireEvent.keyDown(trigger, { key: "ArrowUp" });

    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-expanded", "false"),
    );
  });
});
