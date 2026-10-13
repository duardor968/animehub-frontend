import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiConnectionError,
  ApiResponseError,
  ApiTimeoutError,
  type HomeResponse,
} from "@/lib/api/client";
import { fetchHome } from "@/lib/api/home";
import { MAIN_CONTENT_ID } from "@/lib/navigation";
import {
  describeHomeError,
  HomePlaceholder,
  HomeView,
  mergeHomeSnapshot,
} from "./home-view";

vi.mock("@/lib/api/home", () => ({ fetchHome: vi.fn() }));
vi.mock("./featured-hero", () => ({
  HERO_HEIGHT_CLASS: "hero-height",
  FeaturedHero: ({ anime }: { anime: { title: string }[] }) => (
    <div>{anime[0].title}</div>
  ),
}));
vi.mock("./recent-episodes", () => ({
  RecentEpisodes: ({
    episodes,
  }: {
    episodes: { episode: { number: number } }[];
  }) => <div>Episode {episodes[0].episode.number}</div>,
}));
vi.mock("@/components/poster-grid", () => ({
  PosterGrid: ({ anime }: { anime: { title: string }[] }) => (
    <div>New {anime[0].title}</div>
  ),
  PosterGridSkeleton: ({ aspect = "poster" }: { aspect?: string }) => (
    <div data-testid={`skeleton-${aspect}`} />
  ),
}));

function home(number = 1): HomeResponse {
  const anime = {
    id: "anime",
    slug: "anime",
    title: "A show",
    status: "AIRING" as const,
    mature: false,
  };
  return {
    data: {
      featured: [{ ...anime, genres: [] }],
      recentEpisodes: [{ anime, episode: { id: `episode-${number}`, number } }],
      recentAnime: [anime],
    },
    meta: {
      fetchedAt: "2026-10-05T12:00:00.000Z",
      nextRefreshAt: "2026-10-05T12:04:00.000Z",
      stale: false,
    },
  };
}
let visibility: DocumentVisibilityState;
beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(
    () => visibility,
  );
  vi.mocked(fetchHome).mockReset().mockResolvedValue(home(2));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("automatic home recovery", () => {
  it("shows server content immediately and refreshes after one visible minute", async () => {
    render(<HomeView initialHome={home()} />);
    expect(screen.getByText("Episode 1")).toBeVisible();
    expect(fetchHome).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(fetchHome).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Episode 2")).toBeVisible();
    expect(screen.queryByRole("button", { name: /reintentar/i })).toBeNull();
  });

  it("pauses while hidden, refreshes on return and removes work on unmount", async () => {
    const { unmount } = render(<HomeView initialHome={home()} />);
    visibility = "hidden";
    fireEvent(document, new Event("visibilitychange"));
    await act(() => vi.advanceTimersByTimeAsync(180_000));
    expect(fetchHome).not.toHaveBeenCalled();
    visibility = "visible";
    await act(async () => {
      fireEvent(document, new Event("visibilitychange"));
      fireEvent(window, new Event("focus"));
    });
    expect(fetchHome).toHaveBeenCalledTimes(1);
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(fetchHome).toHaveBeenCalledTimes(1);
  });

  it("keeps last-good content during polling errors", async () => {
    vi.mocked(fetchHome).mockRejectedValue(new Error("temporary outage"));
    render(<HomeView initialHome={home()} />);
    await act(() => vi.advanceTimersByTimeAsync(180_000));
    expect(screen.getByText("Episode 1")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
  });

  it("without server data, fails after one attempt, says why and retries on demand", async () => {
    vi.mocked(fetchHome).mockRejectedValue(
      new ApiResponseError(429, "Too Many Requests", 60_000),
    );
    render(<HomeView initialHome={null} />);
    expect(
      screen.getByRole("main", { name: "Cargando portada" }),
    ).toBeVisible();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(fetchHome).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "No se pudo cargar la portada",
      }),
    ).toBeVisible();
    expect(screen.getByText(/^Demasiadas solicitudes/)).toBeVisible();

    vi.mocked(fetchHome).mockResolvedValue(home(3));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    });
    expect(fetchHome).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Episode 3")).toBeVisible();
  });

  it("names each kind of failure", () => {
    expect(describeHomeError(new ApiTimeoutError())).toBe(
      "El servidor tardó demasiado en responder.",
    );
    expect(describeHomeError(new ApiConnectionError())).toBe(
      "No se pudo conectar con el servidor.",
    );
    expect(describeHomeError(new ApiResponseError(503, "Unavailable"))).toBe(
      "El servidor no está disponible ahora mismo.",
    );
  });

  it("shows the sections it has and a retry for the one the API lacks", async () => {
    const partial = home();
    partial.data.recentAnime = [];
    vi.mocked(fetchHome).mockResolvedValue(partial);
    render(<HomeView initialHome={partial} />);
    expect(screen.getByText("Episode 1")).toBeVisible();
    expect(screen.getByTestId("skeleton-poster")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(fetchHome).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("skeleton-poster")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "No se pudo cargar esta sección" }),
    ).toBeVisible();
    expect(
      screen.getByText("El servidor aún no tiene estos datos."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
  });

  it("does not erase a good section when another section updates", () => {
    const previous = home();
    const next = home(2);
    next.data.featured = [];
    next.data.recentAnime = [];
    next.meta.fetchedAt = "2026-10-05T12:10:00.000Z";
    const merged = mergeHomeSnapshot(previous, next);
    expect(merged.data.featured).toBe(previous.data.featured);
    expect(merged.data.recentAnime).toBe(previous.data.recentAnime);
    expect(merged.data.recentEpisodes[0].episode.number).toBe(2);
    expect(merged.meta.fetchedAt).toBe(previous.meta.fetchedAt);
    expect(merged.meta.stale).toBe(true);
  });

  it("deduplicates active requests and aborts them on unmount", async () => {
    let receivedSignal: AbortSignal | undefined;
    vi.mocked(fetchHome).mockImplementation((_client, signal) => {
      receivedSignal = signal;
      return new Promise(() => {});
    });
    const { unmount } = render(<HomeView initialHome={null} />);
    fireEvent(window, new Event("focus"));
    fireEvent(document, new Event("visibilitychange"));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(fetchHome).toHaveBeenCalledTimes(1);
    unmount();
    expect(receivedSignal?.aborted).toBe(true);
  });
});

it("renders a structured placeholder with the hero height and both sections", () => {
  const { container } = render(<HomePlaceholder />);
  expect(container.querySelector(".hero-height .skeleton")).not.toBeNull();
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(
    screen.getByRole("heading", { name: "Episodios recientes" }),
  ).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Últimos agregados" }),
  ).toBeVisible();
  expect(screen.getByTestId("skeleton-still")).toBeInTheDocument();
  expect(screen.getByTestId("skeleton-poster")).toBeInTheDocument();
});

it("gives the home one page heading, section links and a skip target", () => {
  render(<HomeView initialHome={home()} />);
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByRole("main")).toHaveAttribute("id", MAIN_CONTENT_ID);
  expect(screen.getByRole("link", { name: /Ver horario/ })).toHaveAttribute(
    "href",
    "/horario",
  );
  expect(screen.getByRole("link", { name: /Ver catálogo/ })).toHaveAttribute(
    "href",
    "/catalogo",
  );
});
