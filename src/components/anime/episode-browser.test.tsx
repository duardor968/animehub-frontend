/* eslint-disable @next/next/no-img-element -- the real component uses next/image; this test double only exposes alt text */
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { apiFetch, type Episode } from "@/lib/api/client";
import type {
  DownloadActivityStatus,
  DownloadRequest,
} from "../downloads/download-types";
import { EpisodeBrowser } from "./episode-browser";

vi.mock("../anime-image", () => ({
  AnimeImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock("@/lib/api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...original, apiFetch: vi.fn() };
});

const downloads = vi.hoisted(() => ({
  openDownload: vi.fn(),
  status: undefined as DownloadActivityStatus | undefined,
  deviceProfile: "desktop" as "desktop" | "portable",
}));

vi.mock("../downloads/download-provider", () => ({
  MAX_JOB_EPISODES: 5000,
  useDownloads: () => ({
    openDownload: downloads.openDownload,
    getRequestStatus: () => downloads.status,
    preferences: { audio: "SUB", providers: ["MEGA"], destination: "CNL" },
    deviceProfile: downloads.deviceProfile,
    dockSlot: document.body,
  }),
}));

vi.mock("../downloads/episode-download-button", () => ({
  EpisodeDownloadButton: ({ episodeNumber }: { episodeNumber: number }) => (
    <button>Descargar episodio {episodeNumber}</button>
  ),
}));

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

beforeEach(() => {
  downloads.openDownload.mockReset();
  downloads.status = undefined;
  downloads.deviceProfile = "desktop";
  vi.mocked(apiFetch).mockReset();
  window.history.replaceState(null, "", "/anime/otome");
});

afterEach(cleanup);

const makeEpisode = (
  number: number,
  extra: Partial<Episode> = {},
): Episode => ({
  id: `episode-${number}`,
  number,
  title: null,
  imageUrl: `/episode-${number}.jpg`,
  publishedAt: null,
  ...extra,
});

const pageOf = (start: number, count = 50) =>
  Array.from({ length: count }, (_, index) => makeEpisode(start + index));

function renderBrowser(
  props: Partial<Parameters<typeof EpisodeBrowser>[0]> = {},
) {
  return render(
    <EpisodeBrowser
      slug="otome"
      title="Otome Kaijuu Caraméliser"
      initial={[makeEpisode(1), makeEpisode(2)]}
      totalRecords={2}
      firstNumber={1}
      lastNumber={2}
      {...props}
    />,
  );
}

describe("EpisodeBrowser", () => {
  it("keeps the corner glyph and selected styling while masking the seam", () => {
    const { container } = renderBrowser();

    const [selector] = screen.getAllByRole("checkbox", {
      name: "Seleccionar episodio 2",
    });
    const card = container.querySelector(".media-card-clip");

    expect(card).toBeTruthy();
    expect(card).not.toHaveClass("overflow-hidden");
    expect(container.querySelector(".lucide-square")).toBeTruthy();

    fireEvent.click(selector);

    expect(
      screen.getAllByRole("checkbox", { name: "Quitar episodio 2" })[0],
    ).toBeChecked();
    expect(container.querySelector(".lucide-check")).toBeTruthy();
    // The count is shown once (in the selection bar) and announced politely.
    expect(screen.getByText("seleccionado")).toBeVisible();
    expect(screen.getByText("1 episodio seleccionado")).toHaveAttribute(
      "aria-live",
      "polite",
    );

    fireEvent.click(
      screen.getAllByRole("checkbox", { name: "Quitar episodio 2" })[0],
    );
    expect(
      screen.getAllByRole("checkbox", { name: "Seleccionar episodio 2" })[0],
    ).not.toBeChecked();
  });

  it("shows a single CTA for a movie numbered from zero", () => {
    renderBrowser({
      initial: [makeEpisode(0)],
      totalRecords: 1,
      firstNumber: 0,
      lastNumber: 0,
      isMovie: true,
    });

    expect(screen.queryByText("Descargar un rango")).toBeNull();
    expect(screen.queryByText(/Seleccionar/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Descargar todo/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Descargar película" }));
    expect(downloads.openDownload).toHaveBeenCalledWith({
      slug: "otome",
      title: "Otome Kaijuu Caraméliser",
      episodeNumbers: [0],
    });
  });

  it("validates the range instead of silently shrinking it", () => {
    renderBrowser({
      initial: pageOf(1),
      totalRecords: 120,
      firstNumber: 1,
      lastNumber: 120,
    });

    const from = screen.getByRole("spinbutton", { name: "Episodio inicial" });
    const to = screen.getByRole("spinbutton", { name: "Episodio final" });
    fireEvent.change(from, { target: { value: "10" } });
    fireEvent.change(to, { target: { value: "5" } });

    expect(
      screen.getByText(
        "El episodio inicial debe ser menor o igual que el final.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Descargar rango" }),
    ).toBeDisabled();

    // The field can be cleared while typing instead of snapping to 1.
    fireEvent.change(to, { target: { value: "" } });
    expect(to).toHaveValue("");
    fireEvent.change(to, { target: { value: "15" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Descargar 6 episodios" }),
    );
    expect(downloads.openDownload).toHaveBeenCalledWith({
      slug: "otome",
      title: "Otome Kaijuu Caraméliser",
      from: 10,
      to: 15,
      total: 6,
    });
  });

  it("doesn't promise a count when specials or gaps can fall in the range", () => {
    // 120 episodes numbered 1–119: one of them is a special (e.g. 12.5).
    renderBrowser({
      initial: pageOf(1),
      totalRecords: 120,
      firstNumber: 1,
      lastNumber: 119,
    });

    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Episodio inicial" }),
      {
        target: { value: "12" },
      },
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Episodio final" }),
      {
        target: { value: "13" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Descargar episodios 12–13" }),
    );
    expect(downloads.openDownload).toHaveBeenCalledWith({
      slug: "otome",
      title: "Otome Kaijuu Caraméliser",
      from: 12,
      to: 13,
    });
  });

  it("confirms before downloading a long series", () => {
    renderBrowser({
      initial: pageOf(1),
      totalRecords: 1180,
      firstNumber: 1,
      lastNumber: 1180,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Descargar todo (1.180)" }),
    );
    expect(downloads.openDownload).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    expect(
      within(dialog).getByText("¿Descargar los 1.180 episodios?"),
    ).toBeVisible();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Descargar 1.180" }),
    );
    expect(downloads.openDownload).toHaveBeenCalledWith({
      slug: "otome",
      title: "Otome Kaijuu Caraméliser",
      all: true,
      total: 1180,
    });
  });

  it("sends selections above 50 episodes as one list", () => {
    renderBrowser({
      initial: pageOf(1, 51),
      totalRecords: 51,
      firstNumber: 1,
      lastNumber: 51,
    });

    fireEvent.click(
      screen.getByRole("checkbox", { name: /Seleccionar esta página/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Descargar selección" }),
    );

    const request = downloads.openDownload.mock.calls[0][0] as DownloadRequest;
    expect(request.episodeNumbers).toHaveLength(51);
    expect(request.from).toBeUndefined();
  });

  it("clears the selection once it was delivered", () => {
    const view = renderBrowser();
    fireEvent.click(
      screen.getAllByRole("checkbox", { name: "Seleccionar episodio 1" })[0],
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Descargar selección" }),
    );
    const request = downloads.openDownload.mock.calls[0][0] as DownloadRequest;
    expect(request.episodeNumbers).toEqual([1]);

    downloads.status = "handed-off";
    view.rerender(
      <EpisodeBrowser
        slug="otome"
        title="Otome Kaijuu Caraméliser"
        initial={[makeEpisode(1), makeEpisode(2)]}
        totalRecords={2}
        firstNumber={1}
        lastNumber={2}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Descargar selección" }),
    ).toBeNull();
  });

  it("keeps the page in the URL and recovers from a failed load", async () => {
    renderBrowser({
      initial: pageOf(1),
      totalRecords: 120,
      firstNumber: 1,
      lastNumber: 120,
    });

    vi.mocked(apiFetch).mockRejectedValueOnce(new TypeError("offline"));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Página siguiente" })[0],
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No se pudo cargar la página 2");
    expect(window.location.search).toBe("");

    vi.mocked(apiFetch).mockResolvedValueOnce({
      data: pageOf(51),
      meta: { page: 2, perPage: 50, totalPages: 3, totalRecords: 120 },
    });
    fireEvent.click(within(alert).getByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(window.location.search).toBe("?page=2"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getAllByText("Episodios 51–100 de 120")).toHaveLength(2);

    vi.mocked(apiFetch).mockResolvedValueOnce({
      data: pageOf(1),
      meta: { page: 1, perPage: 50, totalPages: 3, totalRecords: 120 },
    });
    await act(async () => {
      window.history.replaceState(null, "", "/anime/otome");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() =>
      expect(screen.getAllByText("Episodios 1–50 de 120")).toHaveLength(2),
    );
  });

  it("shows relative publish time and an empty state", () => {
    const view = renderBrowser({
      initial: [
        makeEpisode(1, {
          publishedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
        }),
        makeEpisode(2),
      ],
    });
    expect(screen.getAllByText("hace 2 h").length).toBeGreaterThan(0);
    view.unmount();

    renderBrowser({
      initial: [],
      totalRecords: 0,
      firstNumber: 1,
      lastNumber: 1,
    });
    expect(screen.getByText("Aún no hay episodios disponibles")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Descargar/ })).toBeNull();
  });

  it("names where phones actually send the links", () => {
    // Click'n'Load is stored, but a phone sends to MyJDownloader.
    downloads.deviceProfile = "portable";
    renderBrowser({
      initial: pageOf(1),
      totalRecords: 1180,
      firstNumber: 1,
      lastNumber: 1180,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Descargar todo (1.180)" }),
    );
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "se enviarán a MyJDownloader",
    );
  });

  it("shows the page in the URL after Back restored an older render", async () => {
    // Next restored the page-1 render while the URL says ?page=2.
    window.history.replaceState(null, "", "/anime/otome?page=2");
    vi.mocked(apiFetch).mockResolvedValueOnce({
      data: pageOf(51),
      meta: { page: 2, perPage: 50, totalPages: 3, totalRecords: 120 },
    });
    renderBrowser({
      initial: pageOf(1),
      initialPage: 1,
      totalRecords: 120,
      firstNumber: 1,
      lastNumber: 120,
    });

    await waitFor(() =>
      expect(screen.getAllByText("Episodios 51–100 de 120")).toHaveLength(2),
    );
    expect(apiFetch).toHaveBeenCalledWith(
      "/anime/otome/episodes?page=2",
      {},
      true,
    );
  });

  it("keeps pager controls focusable at the ends and while loading", async () => {
    renderBrowser({
      initial: pageOf(1),
      totalRecords: 120,
      firstNumber: 1,
      lastNumber: 120,
    });
    const pager = screen.getByRole("navigation", {
      name: "Páginas de episodios",
    });
    const previous = within(pager).getByRole("button", {
      name: "Página anterior",
    });
    expect(previous).toHaveAttribute("aria-disabled", "true");
    expect(previous).not.toBeDisabled();
    expect(
      within(pager).getByRole("button", { name: "Página 1" }),
    ).toHaveAttribute("aria-current", "page");

    vi.mocked(apiFetch).mockReturnValueOnce(new Promise(() => undefined));
    const next = within(pager).getByRole("button", {
      name: "Página siguiente",
    });
    next.focus();
    fireEvent.click(next);
    // Loading: the pressed control keeps focus (never disabled).
    expect(next).not.toBeDisabled();
    expect(document.activeElement).toBe(next);
    expect(next).toHaveAttribute("aria-busy", "true");
  });
});
