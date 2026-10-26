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
import { I18nProvider } from "@heroui/react";
import type { ReactNode } from "react";
import { apiFetch, type Episode } from "@/lib/api/client";
import { siteUrl } from "@/lib/site";
import type {
  DownloadActivityStatus,
  DownloadRequest,
} from "../downloads/download-types";
import { EpisodeBrowser, MovieDownloadButton } from "./episode-browser";

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
  destination: "CNL" as "CNL" | "COPY",
}));

vi.mock("../downloads/download-provider", () => ({
  MAX_JOB_EPISODES: 5000,
  useDownloads: () => ({
    openDownload: downloads.openDownload,
    getRequestStatus: () => downloads.status,
    destination: downloads.destination,
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
  downloads.destination = "CNL";
  vi.mocked(apiFetch).mockReset();
  window.history.replaceState(null, "", "/anime/otome");
});

afterEach(() => {
  cleanup();
  document.head
    .querySelectorAll('link[rel="canonical"], meta[property="og:url"]')
    .forEach((element) => element.remove());
});

function seedMetadata() {
  const canonical = document.createElement("link");
  canonical.rel = "canonical";
  canonical.href = `${siteUrl}/anime/otome`;
  const openGraphUrl = document.createElement("meta");
  openGraphUrl.setAttribute("property", "og:url");
  openGraphUrl.content = canonical.href;
  document.head.append(canonical, openGraphUrl);
  return () => [canonical.href, openGraphUrl.content];
}

const anime = { slug: "otome", title: "Otome Kaijuu Caraméliser" };

const makeEpisode = (number: number): Episode => ({
  id: `episode-${number}`,
  number,
  title: null,
  imageUrl: `/episode-${number}.jpg`,
  publishedAt: null,
});

const pageOf = (start: number, count = 50) =>
  Array.from({ length: count }, (_, index) => makeEpisode(start + index));

// The app renders inside the Spanish locale (Providers): "12,5".
const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider locale="es-ES">{children}</I18nProvider>
);

function renderBrowser(
  props: Partial<Parameters<typeof EpisodeBrowser>[0]> = {},
) {
  return render(
    <EpisodeBrowser
      {...anime}
      initial={pageOf(1, 3)}
      totalRecords={3}
      firstNumber={1}
      lastNumber={3}
      {...props}
    />,
    { wrapper },
  );
}

/** Types into a React Aria number field and commits it, like leaving it. */
function setNumber(name: string, value: string) {
  const input = screen.getByRole("textbox", { name });
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
  return input;
}

describe("EpisodeBrowser", () => {
  it("offers each way to download only when it adds something", () => {
    const one = renderBrowser({
      initial: [makeEpisode(1)],
      totalRecords: 1,
      lastNumber: 1,
    });
    expect(screen.getByRole("button", { name: "Descargar episodio 1" }));
    expect(screen.queryByRole("button", { name: /Descargar todo/ })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    one.unmount();

    // Two episodes: everything or one of them, nothing to select.
    const two = renderBrowser({
      initial: pageOf(1, 2),
      totalRecords: 2,
      lastNumber: 2,
    });
    expect(screen.getByRole("button", { name: "Descargar todo" }));
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("group", { name: "Rango de episodios" })).toBe(
      null,
    );
    two.unmount();

    const three = renderBrowser();
    expect(screen.getByRole("checkbox", { name: "Seleccionar todos" }));
    expect(screen.getByRole("checkbox", { name: "Episodio 3" }));
    expect(screen.queryByRole("group", { name: "Rango de episodios" })).toBe(
      null,
    );
    three.unmount();

    // More than one page: the range covers spans the selection can't.
    renderBrowser({ initial: pageOf(1), totalRecords: 120, lastNumber: 120 });
    expect(screen.getByRole("group", { name: "Rango de episodios" }));
    expect(screen.getByRole("checkbox", { name: "Seleccionar esta página" }));
  });

  it("never repeats the episode total the page header shows", () => {
    renderBrowser({ initial: pageOf(1), totalRecords: 120, lastNumber: 120 });
    expect(screen.queryByText(/120/)).toBeNull();
  });

  it("labels episodes without grouping and with decimals", () => {
    renderBrowser({
      initial: [makeEpisode(1151), makeEpisode(24.5)],
      totalRecords: 2,
    });
    expect(screen.getAllByText("1151")).toHaveLength(1);
    expect(screen.getByText("Episodio 24,5")).toBeInTheDocument();
  });

  it("selects episodes and clears the selection once delivered", () => {
    const view = renderBrowser();
    fireEvent.click(screen.getByRole("checkbox", { name: "Episodio 2" }));

    expect(screen.getByRole("checkbox", { name: "Episodio 2" })).toBeChecked();
    // The count is shown once (in the selection bar) and announced politely.
    expect(screen.getByText("seleccionado")).toBeVisible();
    expect(screen.getByText("1 episodio seleccionado")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    fireEvent.click(screen.getByRole("button", { name: "Descargar" }));
    const request = downloads.openDownload.mock.calls[0][0] as DownloadRequest;
    expect(request).toEqual({ ...anime, episodeNumbers: [2] });

    downloads.status = "handed-off";
    view.rerender(
      <EpisodeBrowser
        {...anime}
        initial={pageOf(1, 3)}
        totalRecords={3}
        firstNumber={1}
        lastNumber={3}
      />,
    );
    // The bar slides out with its last count, out of reach.
    const bar = document.querySelector(".dock-bar[data-exiting]");
    expect(bar).toHaveAttribute("inert");
    expect(bar).toHaveTextContent("1 seleccionado");
  });

  it("returns the focus to the list when the selection is cleared", () => {
    renderBrowser();
    fireEvent.click(screen.getByRole("checkbox", { name: "Episodio 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Deseleccionar" }));

    expect(
      screen.getByRole("checkbox", { name: "Episodio 2" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Seleccionar todos" }),
    ).toHaveFocus();
  });

  it("sends a whole page selection as one list", () => {
    renderBrowser({ initial: pageOf(1), totalRecords: 120, lastNumber: 120 });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Seleccionar esta página" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Descargar" }));

    const request = downloads.openDownload.mock.calls[0][0] as DownloadRequest;
    expect(request.episodeNumbers).toHaveLength(50);
    expect(request.from).toBeUndefined();
  });

  it("keeps the range bounds from crossing and refills an emptied one", () => {
    renderBrowser({ initial: pageOf(1), totalRecords: 120, lastNumber: 120 });

    // «Hasta» can't go below «Desde», nor «Desde» above «Hasta».
    setNumber("Desde", "10");
    expect(setNumber("Hasta", "5")).toHaveValue("10");
    expect(setNumber("Desde", "30")).toHaveValue("10");
    expect(
      screen.getByRole("button", { name: "Descargar rango" }),
    ).toBeEnabled();

    // A field left empty gets its value back, without an error.
    expect(setNumber("Hasta", "")).toHaveValue("10");
    expect(screen.queryByRole("alert")).toBeNull();

    setNumber("Hasta", "15");
    fireEvent.click(screen.getByRole("button", { name: "Descargar rango" }));
    expect(downloads.openDownload).toHaveBeenCalledWith({
      ...anime,
      from: 10,
      to: 15,
      total: 6,
    });
  });

  it("keeps decimal bounds and doesn't promise a count with specials", () => {
    // 61 episodes numbered 1–60 plus 60.5.
    renderBrowser({
      initial: pageOf(1),
      totalRecords: 61,
      lastNumber: 60.5,
    });

    // Past the end it stops at the last episode, not at 61.
    expect(setNumber("Hasta", "70")).toHaveValue("60,5");
    expect(setNumber("Desde", "17,5")).toHaveValue("17,5");
    fireEvent.click(screen.getByRole("button", { name: "Descargar rango" }));
    expect(downloads.openDownload).toHaveBeenCalledWith({
      ...anime,
      from: 17.5,
      to: 60.5,
    });
  });

  it("says Copiar where the links go to the clipboard", () => {
    downloads.destination = "COPY";
    renderBrowser({ initial: pageOf(1), totalRecords: 120, lastNumber: 120 });
    expect(screen.getByRole("button", { name: "Copiar todo" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Copiar rango" })).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: "Episodio 2" }));
    expect(screen.getByRole("button", { name: "Copiar" })).toBeVisible();
  });

  it("leaves the confirmation of a long series to the downloads", () => {
    renderBrowser({ initial: pageOf(1), totalRecords: 1180, lastNumber: 1180 });

    fireEvent.click(screen.getByRole("button", { name: "Descargar todo" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(downloads.openDownload).toHaveBeenCalledWith({
      ...anime,
      all: true,
      total: 1180,
    });
  });

  it("keeps the page in the URL and recovers from a failed load", async () => {
    const metadata = seedMetadata();
    renderBrowser({ initial: pageOf(1), totalRecords: 120, lastNumber: 120 });
    const top = screen.getByRole("navigation", {
      name: "Páginas de episodios",
    });
    expect(within(top).getByRole("link", { name: "Página 2" })).toHaveAttribute(
      "href",
      "/anime/otome?page=2#episodios",
    );

    vi.mocked(apiFetch).mockRejectedValueOnce(new TypeError("offline"));
    fireEvent.click(
      within(top).getByRole("link", { name: "Página siguiente" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No se pudo cargar la página 2");
    expect(window.location.search).toBe("");
    expect(metadata()).toEqual(Array(2).fill(`${siteUrl}/anime/otome`));

    vi.mocked(apiFetch).mockResolvedValueOnce({
      data: pageOf(51),
      meta: { page: 2, perPage: 50, totalPages: 3, totalRecords: 120 },
    });
    fireEvent.click(within(alert).getByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(window.location.search).toBe("?page=2"));
    expect(metadata()).toEqual(Array(2).fill(`${siteUrl}/anime/otome?page=2`));
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("list", { name: "Episodios, página 2 de 3" }),
    ).toBeInTheDocument();

    vi.mocked(apiFetch).mockResolvedValueOnce({
      data: pageOf(1),
      meta: { page: 1, perPage: 50, totalPages: 3, totalRecords: 120 },
    });
    await act(async () => {
      window.history.replaceState(null, "", "/anime/otome");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() =>
      expect(
        screen.getByRole("list", { name: "Episodios, página 1 de 3" }),
      ).toBeInTheDocument(),
    );
    expect(metadata()).toEqual(Array(2).fill(`${siteUrl}/anime/otome`));
  });

  it("shows the page in the URL after Back restored an older render", async () => {
    const metadata = seedMetadata();
    // Next restored the page-1 render while the URL says ?page=2.
    window.history.replaceState(null, "", "/anime/otome?page=2");
    vi.mocked(apiFetch).mockResolvedValueOnce({
      data: pageOf(51),
      meta: { page: 2, perPage: 50, totalPages: 3, totalRecords: 120 },
    });
    renderBrowser({ initial: pageOf(1), totalRecords: 120, lastNumber: 120 });

    await waitFor(() =>
      expect(
        screen.getByRole("list", { name: "Episodios, página 2 de 3" }),
      ).toBeInTheDocument(),
    );
    expect(apiFetch).toHaveBeenCalledWith(
      "/anime/otome/episodes?page=2",
      {},
      true,
    );
    expect(metadata()).toEqual(Array(2).fill(`${siteUrl}/anime/otome?page=2`));
  });

  it("keeps the pressed pager control focused while its page loads", () => {
    renderBrowser({ initial: pageOf(1), totalRecords: 120, lastNumber: 120 });
    const pager = screen.getByRole("navigation", {
      name: "Páginas de episodios",
    });
    vi.mocked(apiFetch).mockReturnValueOnce(new Promise(() => undefined));
    const next = within(pager).getByRole("link", { name: "Página siguiente" });
    next.focus();
    fireEvent.click(next);

    expect(document.activeElement).toBe(next);
    expect(next).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("list", { name: /Episodios/ })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("explains an anime without episodes yet", () => {
    renderBrowser({
      initial: [],
      totalRecords: 0,
      nextEpisodeAt: "2026-10-20T00:00:00.000Z",
    });
    expect(screen.getByText("Aún no hay episodios")).toBeVisible();
    expect(
      screen.getByText("El primero se publica el 20 de octubre de 2026."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Ver horario" })).toHaveAttribute(
      "href",
      "/horario",
    );
    expect(screen.queryByRole("button", { name: /Descargar/ })).toBeNull();
  });
});

describe("MovieDownloadButton", () => {
  it("downloads the movie's only video", () => {
    const view = render(<MovieDownloadButton {...anime} episodeNumber={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Descargar película" }));
    expect(downloads.openDownload).toHaveBeenCalledWith({
      ...anime,
      episodeNumbers: [0],
      movie: true,
    });

    downloads.destination = "COPY";
    view.rerender(<MovieDownloadButton {...anime} episodeNumber={0} />);
    expect(
      screen.getByRole("button", { name: "Copiar enlaces" }),
    ).toBeVisible();
  });
});
