import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Toast, toast } from "@heroui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());
const sendToClickNLoad = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/client", () => ({ apiFetch }));
vi.mock("./download-client", () => ({
  connectMyJd: vi.fn(),
  copyLinks: vi.fn(),
  listMyJdDevices: vi.fn().mockResolvedValue([]),
  providerLabels: {
    MEGA: "Mega",
    PIXELDRAIN: "Pixeldrain",
    MP4UPLOAD: "MP4Upload",
    ONE_FICHIER: "1Fichier",
  },
  sendToClickNLoad,
  sendToMyJd: vi.fn(),
}));

import { DownloadProvider, useDownloads } from "./download-provider";

function renderProvider() {
  return render(
    <>
      <Toast.Provider placement="bottom end" />
      <DownloadProvider>
        <Harness />
      </DownloadProvider>
    </>,
  );
}

function Harness() {
  const downloads = useDownloads();
  return (
    <>
      <button onClick={downloads.openSettings}>Abrir preferencias</button>
      <button
        onClick={() =>
          downloads.openDownload({
            slug: "fixture",
            title: "Fixture",
            episodeNumbers: [1],
          })
        }
      >
        Descargar uno
      </button>
      <button
        onClick={() =>
          downloads.openDownload({
            slug: "fixture",
            title: "Fixture",
            episodeNumbers: [1, 2],
          })
        }
      >
        Descargar lote
      </button>
      <button
        onClick={() =>
          downloads.openDownload({
            slug: "fixture",
            title: "Fixture",
            from: 1,
            to: 2,
          })
        }
      >
        Descargar rango
      </button>
    </>
  );
}

const resolved = {
  data: {
    packageName: "Fixture",
    episodes: [
      {
        episodeNumber: 1,
        audio: "SUB",
        links: [{ provider: "MEGA", url: "https://example.com/file" }],
        errorCode: null,
      },
    ],
  },
};

describe("DownloadProvider", () => {
  afterEach(() => {
    toast.clear();
    cleanup();
  });
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    apiFetch.mockResolvedValue(resolved);
    sendToClickNLoad.mockReset().mockResolvedValue({
      acceptedAt: "2026-08-13T12:00:00.000Z",
    });
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        matches: false,
        media: "",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("crypto", { randomUUID: () => "activity-id" });
  });

  it("starts with the required SUB, provider and destination defaults", async () => {
    renderProvider();
    fireEvent.click(screen.getByRole("button", { name: "Abrir preferencias" }));

    expect(await screen.findByRole("radio", { name: "SUB" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.getByText("Mega").closest("label")?.querySelector("input"),
    ).toBeChecked();
    expect(
      screen.getByText("Pixeldrain").closest("label")?.querySelector("input"),
    ).toBeChecked();
    expect(
      screen.getByText("MP4Upload").closest("label")?.querySelector("input"),
    ).toBeChecked();
    expect(
      screen.getByText("1Fichier").closest("label")?.querySelector("input"),
    ).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Click'n'Load" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.queryByText(/Confirmar antes de enviar/),
    ).not.toBeInTheDocument();
  });

  it("uses saved defaults immediately without opening a confirmation drawer", async () => {
    renderProvider();
    fireEvent.click(screen.getByRole("button", { name: "Descargar uno" }));
    await waitFor(() => expect(sendToClickNLoad).toHaveBeenCalledOnce());
    expect(screen.queryByText("Confirmar descarga")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Descargar lote" }));
    await waitFor(() => expect(sendToClickNLoad).toHaveBeenCalledTimes(2));
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Confirmar descarga")).not.toBeInTheDocument();
  });

  it("shows a truthful error when Click'n'Load does not acknowledge the request", async () => {
    const danger = vi.spyOn(toast, "danger");
    localStorage.setItem(
      "animehub.download-preferences",
      JSON.stringify({
        audio: "SUB",
        providers: ["MEGA"],
        destination: "CNL",
      }),
    );
    sendToClickNLoad.mockRejectedValueOnce(
      new Error("JDownloader no respondió en 8 segundos."),
    );

    renderProvider();
    fireEvent.click(screen.getByRole("button", { name: "Descargar uno" }));

    await waitFor(() => {
      expect(danger).toHaveBeenCalledWith(
        "JDownloader no respondió",
        expect.objectContaining({ timeout: 0 }),
      );
    });
    expect(sendToClickNLoad).toHaveBeenCalledOnce();
  });

  it("publishes progress immediately for a background range job", () => {
    const info = vi.spyOn(toast, "info");
    apiFetch.mockImplementation(() => new Promise(() => undefined));

    renderProvider();
    fireEvent.click(screen.getByRole("button", { name: "Descargar rango" }));

    expect(info).toHaveBeenCalledWith(
      "Resolviendo espejos",
      expect.objectContaining({ isLoading: true, timeout: 0 }),
    );
  });
});
