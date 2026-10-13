import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { components } from "@/lib/api/generated";
import { ScheduleBoard } from "./schedule-board";

type Entry = components["schemas"]["ScheduleEntryDto"];

const { refresh, search } = vi.hoisted(() => ({
  refresh: vi.fn(),
  search: { value: "" },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  useSearchParams: () => new URLSearchParams(search.value),
}));

const finale: Entry = {
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
/** A weekly series whose episode 11 aired on `published`. */
const airing = (title: string, published: Date): Entry => ({
  ...finale,
  anime: { ...finale.anime, id: title, slug: title, title, status: "AIRING" },
  latestEpisode: { id: "11", number: 11 },
  basisPublishedAt: published.toISOString(),
  isFinalEpisode: false,
});

const server = {
  serverNow: new Date(2026, 8, 28, 23, 59, 50).toISOString(),
  serverTimeZone: "UTC",
};

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockClear();
  search.value = "";
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
  vi.restoreAllMocks();
});

describe("schedule live updates", () => {
  it("keeps a finale on its day all week and drops it when the week rolls over", async () => {
    render(<ScheduleBoard entries={[finale]} {...server} />);
    expect(screen.getByText("Final")).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.getByText("Serie finalizada")).toBeTruthy();

    vi.setSystemTime(new Date(2026, 9, 5, 0, 0, 5));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(screen.queryByText("Serie finalizada")).toBeNull();
    // The day the user was looking at stays selected.
    const monday = screen.getByRole("tabpanel", { name: /^lunes/ });
    expect(monday).not.toHaveAttribute("inert");
    expect(within(monday).getByText("Sin episodios este día")).toBeTruthy();
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
    const pending = airing("Serie", new Date(2026, 8, 21, 13));
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

describe("schedule states", () => {
  const monday = (hour: number) => new Date(2026, 8, 21, hour);
  const entries = [
    airing("Antes", monday(9)),
    airing("En hora", monday(14)),
    airing("Después", monday(20)),
  ];

  it("labels each slot of the day with the same criteria", () => {
    vi.setSystemTime(new Date(2026, 8, 28, 15));
    render(<ScheduleBoard entries={entries} {...server} />);
    const card = (title: string) =>
      screen.getByRole("link", { name: new RegExp(`^${title},`) });
    expect(card("Antes")).toHaveTextContent("Retrasado");
    expect(card("En hora")).toHaveTextContent("Ahora");
    expect(card("Después")).toHaveTextContent("Próximo");
  });
  it("predicts nothing from data that could not be refreshed", () => {
    vi.setSystemTime(new Date(2026, 8, 28, 15));
    render(<ScheduleBoard entries={entries} {...server} stale />);
    expect(
      screen.getByRole("link", { name: "Antes, episodio 11, 09:00" }),
    ).not.toHaveTextContent(/Retrasado|Ahora|Próximo/);
  });
});

describe("schedule semantics and accessibility", () => {
  it("names cards with title, episode, status and hour, and marks today", () => {
    vi.setSystemTime(new Date(2026, 8, 28, 12));
    render(
      <ScheduleBoard
        {...server}
        entries={[airing("Serie", new Date(2026, 8, 21, 13, 5))]}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Serie, episodio 12, próximo, 13:05" }),
    ).toHaveAttribute("href", "/anime/Serie");
    expect(
      screen.getByRole("tab", { name: "lunes, 1 episodio, hoy" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("tab", { name: "martes, 0 episodios" }),
    ).toBeTruthy();
  });
});

describe("selected day in the URL", () => {
  it("opens the day in ?dia= instead of today", () => {
    search.value = "dia=sabado";
    render(<ScheduleBoard entries={[finale]} {...server} />);
    expect(screen.getByRole("tab", { name: /^sábado/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel", { name: /^sábado/ })).toBeTruthy();
  });
  it("writes the chosen day to the URL without a navigation", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(<ScheduleBoard entries={[finale]} {...server} />);
    fireEvent.click(screen.getByRole("tab", { name: /^miércoles/ }));
    expect(replaceState).toHaveBeenCalledWith(null, "", "?dia=miercoles");
  });
  it("falls back to today for an unknown day", () => {
    search.value = "dia=festivo";
    render(<ScheduleBoard entries={[finale]} {...server} />);
    expect(screen.getByRole("tab", { name: /^lunes/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

describe("first visit in a guessed zone", () => {
  it("keeps the server render hidden under a skeleton unless the viewer is in that zone", () => {
    const html = renderToString(
      <ScheduleBoard entries={[finale]} {...server} zoneConfirmed={false} />,
    );
    // Hidden by CSS until hydration regroups the week…
    expect(html).toContain('data-zone-pending="UTC"');
    expect(html).toContain("schedule-skeleton");
    // …or shown at once when the head script found the same zone.
    expect(html).toContain(
      'html[data-tz="UTC"] [data-zone-pending="UTC"],html[data-tz="UTC"] .site-footer{visibility:visible}',
    );
  });

  it("renders normally with the viewer's own zone and after hydration", () => {
    const html = renderToString(
      <ScheduleBoard entries={[finale]} {...server} />,
    );
    expect(html).not.toContain("data-zone-pending");
    expect(html).not.toContain("schedule-skeleton");
    const { container } = render(
      <ScheduleBoard entries={[finale]} {...server} zoneConfirmed={false} />,
    );
    expect(container.querySelector("[data-zone-pending]")).toBeNull();
    expect(container.querySelector(".schedule-skeleton")).toBeNull();
  });
});
