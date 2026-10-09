import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeaturedAnime } from "@/lib/api/client";
import { AUTOPLAY_DELAY_MS, FeaturedHero, SlideTimer } from "./featured-hero";

const { carousel, state } = vi.hoisted(() => {
  const state = {
    index: 0,
    count: 2,
    handlers: new Map<string, Set<() => void>>(),
  };
  const emit = (event: string) =>
    state.handlers.get(event)?.forEach((handler) => handler());
  const select = (index: number) => {
    if (index === state.index) return;
    state.index = index;
    emit("select");
  };
  const carousel = {
    selectedScrollSnap: () => state.index,
    on: (event: string, handler: () => void) => {
      if (!state.handlers.has(event)) state.handlers.set(event, new Set());
      state.handlers.get(event)!.add(handler);
    },
    off: (event: string, handler: () => void) =>
      state.handlers.get(event)?.delete(handler),
    canScrollNext: () => state.index < state.count - 1,
    scrollTo: vi.fn((index: number) => select(index)),
    scrollPrev: vi.fn(() =>
      select((state.index + state.count - 1) % state.count),
    ),
    scrollNext: vi.fn(() => select((state.index + 1) % state.count)),
    reInit: vi.fn(() => emit("reInit")),
  };
  return { carousel, state };
});
vi.mock("embla-carousel-react", () => ({ default: () => [vi.fn(), carousel] }));
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

const anime = (
  id: string,
  extra: Partial<FeaturedAnime> = {},
): FeaturedAnime => ({
  id,
  slug: id.toLowerCase(),
  title: id,
  status: "AIRING",
  mature: false,
  genres: [],
  ...extra,
});

let reducedMotion = false;
beforeEach(() => {
  vi.useFakeTimers();
  reducedMotion = false;
  state.index = 0;
  state.count = 2;
  state.handlers.clear();
  vi.clearAllMocks();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: reducedMotion,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const current = () =>
  screen
    .getAllByRole("button", { name: /^Mostrar / })
    .find((button) => button.getAttribute("aria-current") === "true")
    ?.getAttribute("aria-label");

describe("FeaturedHero", () => {
  it("advances every 7s and restarts the full delay after a manual change", async () => {
    render(<FeaturedHero anime={[anime("A"), anime("B")]} />);
    await act(() => vi.advanceTimersByTimeAsync(AUTOPLAY_DELAY_MS));
    expect(current()).toBe("Mostrar B");

    await act(() => vi.advanceTimersByTimeAsync(5_000));
    fireEvent.click(
      screen.getByRole("button", { name: "Destacado siguiente" }),
    );
    expect(current()).toBe("Mostrar A");
    // The old countdown (2s left) must not fire right after the click.
    await act(() => vi.advanceTimersByTimeAsync(AUTOPLAY_DELAY_MS - 100));
    expect(current()).toBe("Mostrar A");
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(current()).toBe("Mostrar B");
  });

  it("pauses without losing progress and resumes with the remaining time", async () => {
    render(<FeaturedHero anime={[anime("A"), anime("B")]} />);
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    fireEvent.click(screen.getByRole("button", { name: "Pausar carrusel" }));
    const bar = screen.getByTestId("hero-progress");
    expect(bar).toHaveStyle({ animationPlayState: "paused" });

    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(current()).toBe("Mostrar A");
    // Same element: the bar freezes instead of restarting from zero.
    expect(screen.getByTestId("hero-progress")).toBe(bar);

    fireEvent.click(screen.getByRole("button", { name: "Reanudar carrusel" }));
    expect(bar).toHaveStyle({ animationPlayState: "running" });
    await act(() => vi.advanceTimersByTimeAsync(3_900));
    expect(current()).toBe("Mostrar A");
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(current()).toBe("Mostrar B");
  });

  it("holds autoplay while keyboard focus is inside and shows it on the bar", async () => {
    render(<FeaturedHero anime={[anime("A"), anime("B")]} />);
    const details = screen.getAllByRole("link", { name: /Ver ficha/ })[0];
    vi.spyOn(details, "matches").mockReturnValue(true);
    act(() => details.focus());

    expect(screen.getByTestId("hero-progress")).toHaveAttribute(
      "data-state",
      "held",
    );
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(current()).toBe("Mostrar A");
    // The intent is still "playing": the button keeps offering to pause.
    expect(
      screen.getByRole("button", { name: "Pausar carrusel" }),
    ).toBeInTheDocument();

    act(() => details.blur());
    await act(() => vi.advanceTimersByTimeAsync(AUTOPLAY_DELAY_MS));
    expect(current()).toBe("Mostrar B");
  });

  it("announces only the changes the user asked for", async () => {
    render(<FeaturedHero anime={[anime("A"), anime("B")]} />);
    const live = document.querySelector("[aria-live=polite]")!;
    await act(() => vi.advanceTimersByTimeAsync(AUTOPLAY_DELAY_MS));
    expect(live).toHaveTextContent("");

    fireEvent.click(screen.getByRole("button", { name: "Mostrar A" }));
    expect(live).toHaveTextContent("A, destacado 1 de 2");
  });

  it("exposes one slide at a time with h2 titles and real links", () => {
    render(
      <FeaturedHero
        anime={[
          anime("A", { trailerUrl: "https://youtube.com/watch?v=a" }),
          anime("B"),
        ]}
      />,
    );
    const slides = document.querySelectorAll(
      "[aria-roledescription=diapositiva]",
    );
    expect(slides).toHaveLength(2);
    expect(slides[0]).not.toHaveAttribute("inert");
    expect(slides[1]).toHaveAttribute("inert");
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(2);
    expect(
      screen.getAllByRole("link", { name: /Ver ficha/ })[0],
    ).toHaveAttribute("href", "/anime/a");
    const trailer = screen
      .getAllByRole("link")
      .find((link) => link.getAttribute("href")?.includes("youtube"));
    expect(trailer).toHaveAccessibleName(
      "Tráiler de A (se abre en otra pestaña)",
    );
    expect(trailer).toHaveAttribute("target", "_blank");
    expect(
      screen.getByRole("group", { name: "Elegir destacado" }),
    ).toBeVisible();
  });

  it("hides placeholder status and pluralizes the episode count", () => {
    render(
      <FeaturedHero
        anime={[
          anime("A", { status: "UNKNOWN", episodeCount: 1180 }),
          anime("B", { episodeCount: 1 }),
        ]}
      />,
    );
    expect(screen.queryByText("Estado por confirmar")).toBeNull();
    expect(screen.getByText("1.180 episodios")).toBeInTheDocument();
    expect(screen.getByText("1 episodio")).toBeInTheDocument();
  });

  it("respects reduced motion until the user explicitly resumes, then jumps", async () => {
    reducedMotion = true;
    render(<FeaturedHero anime={[anime("A"), anime("B")]} />);
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(current()).toBe("Mostrar A");

    fireEvent.click(screen.getByRole("button", { name: "Reanudar carrusel" }));
    expect(
      screen.getByRole("button", { name: "Pausar carrusel" }),
    ).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(AUTOPLAY_DELAY_MS));
    expect(current()).toBe("Mostrar B");
    expect(carousel.scrollNext).toHaveBeenLastCalledWith(true);
  });

  it("retains the selected anime and paused state when refreshed ordering changes", () => {
    const { rerender } = render(
      <FeaturedHero anime={[anime("A"), anime("B")]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mostrar B" }));
    fireEvent.click(screen.getByRole("button", { name: "Pausar carrusel" }));
    rerender(<FeaturedHero anime={[anime("B"), anime("A")]} />);
    expect(current()).toBe("Mostrar B");
    expect(state.index).toBe(0);
    expect(
      screen.getByRole("button", { name: "Reanudar carrusel" }),
    ).toBeVisible();
  });

  it("selects a valid remaining anime if the selected one disappears", () => {
    const { rerender } = render(
      <FeaturedHero anime={[anime("A"), anime("B")]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mostrar B" }));
    rerender(<FeaturedHero anime={[anime("A"), anime("C")]} />);
    expect(current()).toBe("Mostrar A");
    expect(state.index).toBe(0);
  });
});

describe("SlideTimer", () => {
  it("keeps the remaining time across pauses and restarts on demand", () => {
    const elapsed = vi.fn();
    const timer = new SlideTimer(1_000, elapsed);
    timer.start();
    vi.advanceTimersByTime(600);
    timer.pause();
    vi.advanceTimersByTime(5_000);
    expect(elapsed).not.toHaveBeenCalled();
    timer.start();
    vi.advanceTimersByTime(399);
    expect(elapsed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(elapsed).toHaveBeenCalledTimes(1);

    timer.restart();
    vi.advanceTimersByTime(999);
    expect(elapsed).toHaveBeenCalledTimes(1);
    timer.dispose();
    vi.advanceTimersByTime(5_000);
    expect(elapsed).toHaveBeenCalledTimes(1);
  });
});
