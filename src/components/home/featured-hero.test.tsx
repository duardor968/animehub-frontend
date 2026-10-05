import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeaturedAnime } from "@/lib/api/client";
import { FeaturedHero } from "./featured-hero";

const { carousel, state, autoplay } = vi.hoisted(() => {
  const state = { index: 0, handlers: new Map<string, Set<() => void>>() };
  const carousel = {
    selectedScrollSnap: () => state.index,
    containerNode: () =>
      document.querySelector(".featured-hero .touch-pan-y") as HTMLElement,
    on: (event: string, handler: () => void) => {
      if (!state.handlers.has(event)) state.handlers.set(event, new Set());
      state.handlers.get(event)!.add(handler);
    },
    off: (event: string, handler: () => void) =>
      state.handlers.get(event)?.delete(handler),
    scrollTo: vi.fn((index: number) => {
      state.index = index;
      state.handlers.get("select")?.forEach((handler) => handler());
    }),
    scrollPrev: vi.fn(),
    scrollNext: vi.fn(),
    reInit: vi.fn(() =>
      state.handlers.get("reInit")?.forEach((handler) => handler()),
    ),
  };
  return { carousel, state, autoplay: { play: vi.fn(), stop: vi.fn() } };
});
vi.mock("embla-carousel-react", () => ({ default: () => [vi.fn(), carousel] }));
vi.mock("embla-carousel-autoplay", () => ({
  default: () => autoplay,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../anime-image", () => ({ AnimeImage: () => <span /> }));
vi.mock("@heroui/react", () => ({
  Button: (props: {
    children: ReactNode;
    onPress?: () => void;
    "aria-label"?: string;
    "aria-current"?: string;
  }) => (
    <button
      onClick={props.onPress}
      aria-label={props["aria-label"]}
      aria-current={props["aria-current"] as "true" | undefined}
    >
      {props.children}
    </button>
  ),
}));

const anime = (id: string): FeaturedAnime => ({
  id,
  slug: id,
  title: id,
  status: "AIRING",
  mature: false,
  genres: [],
});
beforeEach(() => {
  state.index = 0;
  state.handlers.clear();
  vi.clearAllMocks();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("featured refresh state", () => {
  it("retains the selected anime and paused state when refreshed ordering changes", () => {
    const { rerender } = render(
      <FeaturedHero anime={[anime("A"), anime("B")]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mostrar B" }));
    fireEvent.click(screen.getByRole("button", { name: "Pausar carrusel" }));
    autoplay.stop.mockClear();
    rerender(<FeaturedHero anime={[anime("B"), anime("A")]} />);
    expect(screen.getByRole("button", { name: "Mostrar B" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(state.index).toBe(0);
    expect(autoplay.stop).toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Reanudar carrusel" }),
    ).toBeVisible();
  });

  it("does not restart autoplay under keyboard focus when the feed reorders", () => {
    const { rerender } = render(
      <FeaturedHero anime={[anime("A"), anime("B")]} />,
    );
    const details = screen.getAllByRole("button", { name: "Ver ficha" })[0];
    details.focus();
    expect(details).toHaveFocus();
    autoplay.stop.mockClear();
    rerender(<FeaturedHero anime={[anime("B"), anime("A")]} />);
    expect(details).toHaveFocus();
    expect(autoplay.stop).toHaveBeenCalled();
    expect(state.index).toBe(1);
  });

  it("keeps keyboard-focused content paused when the page becomes visible", () => {
    render(<FeaturedHero anime={[anime("A"), anime("B")]} />);
    const details = screen.getAllByRole("button", { name: "Ver ficha" })[0];
    details.focus();
    autoplay.play.mockClear();
    autoplay.stop.mockClear();
    fireEvent(document, new Event("visibilitychange"));
    expect(details).toHaveFocus();
    expect(autoplay.play).not.toHaveBeenCalled();
    expect(autoplay.stop).toHaveBeenCalled();
  });

  it("selects a valid remaining anime if the selected one disappears", () => {
    const { rerender } = render(
      <FeaturedHero anime={[anime("A"), anime("B")]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mostrar B" }));
    rerender(<FeaturedHero anime={[anime("A"), anime("C")]} />);
    expect(screen.getByRole("button", { name: "Mostrar A" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(state.index).toBe(0);
  });
});
