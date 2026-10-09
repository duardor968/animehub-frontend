import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { components } from "@/lib/api/generated";
import { ScheduleBoard } from "./schedule-board";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const finale: components["schemas"]["ScheduleEntryDto"] = {
  anime: {
    id: "finale",
    slug: "finale",
    title: "Serie finalizada",
    status: "FINISHED",
    mature: false,
  },
  latestEpisode: { id: "12", number: 12 },
  basisPublishedAt: new Date(2026, 8, 28, 13).toISOString(),
  isFinalEpisode: true,
};

const server = {
  serverNow: new Date(2026, 8, 28, 23, 59, 50).toISOString(),
  serverTimeZone: "UTC",
};

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockClear();
  vi.setSystemTime(new Date(2026, 8, 28, 23, 59, 50));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("schedule live updates", () => {
  it("removes the finale at local midnight while still viewing Monday", async () => {
    render(<ScheduleBoard entries={[finale]} {...server} />);
    expect(screen.getByText("Finalizado")).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.queryByText("Serie finalizada")).toBeNull();
    const monday = screen.getByRole("tabpanel", { name: /^lunes/ });
    expect(monday).not.toHaveAttribute("inert");
    expect(
      within(monday).getByRole("heading", { name: /^lunes/ }),
    ).toBeTruthy();
    expect(
      within(monday).getByText("No hay emisiones programadas para este día."),
    ).toBeTruthy();
  });
  it("refreshes data while visible and stops polling after unmount", async () => {
    const { unmount } = render(
      <ScheduleBoard entries={[finale]} {...server} />,
    );
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("changes an upcoming episode to aired without incrementing it again", () => {
    vi.setSystemTime(new Date(2026, 8, 28, 12));
    const pending: components["schemas"]["ScheduleEntryDto"] = {
      ...finale,
      anime: { ...finale.anime, status: "AIRING" },
      latestEpisode: { id: "11", number: 11 },
      basisPublishedAt: new Date(2026, 8, 21, 13).toISOString(),
      isFinalEpisode: false,
    };
    const { rerender } = render(
      <ScheduleBoard entries={[pending]} {...server} />,
    );
    expect(screen.getByText("Próximo")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    rerender(
      <ScheduleBoard
        {...server}
        entries={[
          {
            ...pending,
            latestEpisode: { id: "12", number: 12 },
            basisPublishedAt: new Date(2026, 8, 28, 11).toISOString(),
          },
        ]}
      />,
    );
    expect(screen.getByText("Emitido")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.queryByText("13")).toBeNull();
  });
});

describe("schedule semantics and accessibility", () => {
  it("names cards with title, episode, status and hour, and marks today", () => {
    vi.setSystemTime(new Date(2026, 8, 28, 12));
    render(
      <ScheduleBoard
        {...server}
        entries={[
          {
            ...finale,
            anime: { ...finale.anime, status: "AIRING", title: "Serie" },
            latestEpisode: { id: "11", number: 11 },
            basisPublishedAt: new Date(2026, 8, 21, 13, 5).toISOString(),
            isFinalEpisode: false,
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Serie, episodio 12, próximo, 13:05" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "lunes, 1 lanzamiento, hoy" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("tab", { name: "martes, 0 lanzamientos" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Scroll tabs/ })).toBeNull();
  });
});
