import "@testing-library/jest-dom/vitest";
import { Toast, toast } from "@heroui/react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useEffect } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  ApiResponseError,
  apiFetch,
  type DesktopReleaseResponse,
} from "@/lib/api/client";
import { getDeviceProfile } from "./device-profile";
import {
  copyLinks,
  isMyJdConnected,
  sendToClickNLoad,
  sendToMyJd,
} from "./download-client";
import { PreferencesPanel } from "./download-panels";
import { DownloadProvider, useDownloads } from "./download-provider";
import type { DownloadRequest } from "./download-types";
import { DesktopPromoModal } from "./desktop-promo";
import {
  DESKTOP_PROMO_SEEN_KEY,
  DESKTOP_RELEASES_FALLBACK_URL,
  getDesktopRelease,
  hasSeenDesktopPromo,
  markDesktopPromoSeen,
  resetDesktopReleaseStateForTests,
  resolveDesktopRelease,
} from "./desktop-release";
import type { RemoteDownloads } from "./use-remote-downloads";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...original, apiFetch: vi.fn() };
});

vi.mock("./download-client", () => ({
  connectMyJd: vi.fn(),
  copyLinks: vi.fn(async () => true),
  disconnectMyJd: vi.fn(async () => undefined),
  isMyJdConnected: vi.fn(() => false),
  listMyJdDevices: vi.fn(async () => []),
  sendToClickNLoad: vi.fn(async () => undefined),
  sendToMyJd: vi.fn(async () => undefined),
}));

vi.mock("./device-profile", async (importOriginal) => {
  const original = await importOriginal<typeof import("./device-profile")>();
  return {
    ...original,
    getDeviceProfile: vi.fn(() => "desktop"),
  };
});

const releaseFixture: DesktopReleaseResponse = {
  data: {
    version: "1.4.2",
    tag: "v1.4.2",
    channel: "stable",
    publishedAt: "2026-11-27T12:00:00.000Z",
    notes: "Mejoras de estabilidad.",
    releaseUrl:
      "https://github.com/duardor968/animehub-desktop/releases/tag/v1.4.2",
    paused: false,
    minSupportedVersion: null,
    assets: {
      windowsInstaller: {
        fileName: "AnimeHub-Setup-1.4.2.exe",
        size: 42_000_000,
        sha256: "aaa",
        urls: [
          "https://downloads.animehub.example/AnimeHub-Setup-1.4.2.exe",
          "https://github.com/duardor968/animehub-desktop/releases/download/v1.4.2/AnimeHub-Setup-1.4.2.exe",
        ],
      },
      windowsPortable: null,
      linuxAppImage: {
        fileName: "AnimeHub-1.4.2-x86_64.AppImage",
        size: 45_000_000,
        sha256: "bbb",
        urls: ["https://downloads.animehub.example/AnimeHub-1.4.2.AppImage"],
        zsyncUrl: null,
      },
      linuxDeb: {
        fileName: "animehub_1.4.2_amd64.deb",
        size: 38_000_000,
        sha256: "ccc",
        urls: ["https://downloads.animehub.example/animehub_1.4.2_amd64.deb"],
      },
    },
    manifests: {
      win64: null,
      linuxX64: null,
    },
  },
};

const resolvedEpisode = {
  data: {
    packageName: "Frieren",
    episodes: [
      {
        episodeNumber: 1,
        audio: "SUB",
        links: [{ provider: "MEGA", url: "https://mega.example/frieren-1" }],
        errorCode: null,
      },
    ],
  },
};

const episodeRequest: DownloadRequest = {
  slug: "frieren",
  title: "Frieren",
  episodeNumbers: [1],
};

const handle: { current: ReturnType<typeof useDownloads> | null } = {
  current: null,
};

function Controls() {
  const value = useDownloads();
  useEffect(() => {
    handle.current = value;
  });
  return null;
}

function renderProvider() {
  return render(
    <>
      <Toast.Provider />
      <DownloadProvider>
        <div>AnimeHub</div>
        <Controls />
      </DownloadProvider>
    </>,
  );
}

function remoteStub(overrides: Partial<RemoteDownloads> = {}): RemoteDownloads {
  return {
    devices: [],
    loaded: true,
    requests: [],
    preferred: "",
    target: null,
    chosenDeviceId: "",
    setChosenDeviceId: vi.fn(),
    choosePreferred: vi.fn(),
    busy: false,
    error: null,
    errorScope: "settings",
    profileRetry: null,
    clearError: vi.fn(),
    panel: null,
    setPanel: vi.fn(),
    selectedRequest: null,
    download: null,
    canRetry: false,
    start: vi.fn(),
    refresh: vi.fn(),
    link: vi.fn(),
    unlink: vi.fn(),
    cancel: vi.fn(),
    choose: vi.fn(),
    retry: vi.fn(),
    retryProfile: vi.fn(),
    view: vi.fn(),
    list: vi.fn(),
    status: vi.fn(() => ""),
    brief: vi.fn(() => ({ state: "", name: "" })),
    ...overrides,
  } as unknown as RemoteDownloads;
}

beforeAll(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  resetDesktopReleaseStateForTests();
  vi.clearAllMocks();
  vi.mocked(isMyJdConnected).mockReturnValue(false);
  vi.mocked(getDeviceProfile).mockReturnValue("desktop");
  vi.mocked(copyLinks).mockResolvedValue(true);
  vi.mocked(sendToClickNLoad).mockResolvedValue(undefined);
  vi.mocked(sendToMyJd).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  toast.clear();
  vi.restoreAllMocks();
});

describe("desktop-release client", () => {
  it("fetches /desktop/releases/latest once per session and resolves asset URLs", async () => {
    vi.mocked(apiFetch).mockResolvedValue(releaseFixture);

    const [first, second] = await Promise.all([
      getDesktopRelease(),
      getDesktopRelease(),
    ]);

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(
      "/desktop/releases/latest",
      {},
      true,
      { timeoutMs: 10_000 },
    );
    expect(first).toEqual({
      version: "1.4.2",
      windowsUrl: "https://downloads.animehub.example/AnimeHub-Setup-1.4.2.exe",
      linuxAppImageUrl:
        "https://downloads.animehub.example/AnimeHub-1.4.2.AppImage",
      linuxDebUrl:
        "https://downloads.animehub.example/animehub_1.4.2_amd64.deb",
      releaseUrl:
        "https://github.com/duardor968/animehub-desktop/releases/tag/v1.4.2",
    });
    expect(second).toBe(first);
  });

  it("falls back to GitHub Releases on 404 or paused releases and rejects unsafe URLs", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(
      new ApiResponseError(404, "No release cached."),
    );

    const offline = await getDesktopRelease();
    expect(offline).toEqual({
      version: null,
      windowsUrl: DESKTOP_RELEASES_FALLBACK_URL,
      linuxAppImageUrl: DESKTOP_RELEASES_FALLBACK_URL,
      linuxDebUrl: DESKTOP_RELEASES_FALLBACK_URL,
      releaseUrl: DESKTOP_RELEASES_FALLBACK_URL,
    });

    const paused = resolveDesktopRelease({
      data: { ...releaseFixture.data, paused: true },
    });
    expect(paused.version).toBeNull();
    expect(paused.windowsUrl).toBe(DESKTOP_RELEASES_FALLBACK_URL);
    expect(paused.linuxAppImageUrl).toBe(DESKTOP_RELEASES_FALLBACK_URL);
    expect(paused.linuxDebUrl).toBe(DESKTOP_RELEASES_FALLBACK_URL);

    const unsafe = resolveDesktopRelease({
      data: {
        ...releaseFixture.data,
        assets: {
          ...releaseFixture.data.assets,
          windowsInstaller: {
            fileName: "bad.exe",
            size: 1,
            sha256: "x",
            urls: ["javascript:alert(1)"],
          },
          linuxDeb: null,
        },
      },
    });
    expect(unsafe.windowsUrl).toBe(DESKTOP_RELEASES_FALLBACK_URL);
    expect(unsafe.linuxDebUrl).toBe(DESKTOP_RELEASES_FALLBACK_URL);
    expect(unsafe.linuxAppImageUrl).toBe(
      "https://downloads.animehub.example/AnimeHub-1.4.2.AppImage",
    );
  });

  it("persists dismissal safely even when localStorage throws", () => {
    expect(hasSeenDesktopPromo()).toBe(false);
    markDesktopPromoSeen();
    expect(localStorage.getItem(DESKTOP_PROMO_SEEN_KEY)).toBe("1");
    expect(hasSeenDesktopPromo()).toBe(true);

    localStorage.clear();
    resetDesktopReleaseStateForTests();
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      });
    expect(hasSeenDesktopPromo()).toBe(false);
    markDesktopPromoSeen();
    expect(hasSeenDesktopPromo()).toBe(true);
    setItemSpy.mockRestore();
  });
});

describe("DesktopPromoModal and PreferencesDesktopCard", () => {
  it("opens Windows installer and Linux AppImage / .deb URLs from the API", async () => {
    vi.mocked(apiFetch).mockResolvedValue(releaseFixture);
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    render(<DesktopPromoModal isOpen onOpenChange={vi.fn()} />);

    const dialog = await screen.findByRole("alertdialog", {
      name: "AnimeHub para PC",
    });
    expect(
      await within(dialog).findByText("Versión 1.4.2 · Windows y Linux"),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Seguir en la web" }),
    ).toBeVisible();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Descargar para Windows" }),
    );
    expect(openSpy).toHaveBeenLastCalledWith(
      "https://downloads.animehub.example/AnimeHub-Setup-1.4.2.exe",
      "_blank",
      "noopener,noreferrer",
    );

    const linuxButton = within(dialog).getByRole("button", {
      name: "Descargar para Linux",
    });
    fireEvent.click(linuxButton);
    const appImageItem = await screen.findByRole("menuitem", {
      name: "AppImage (recomendado)",
    });
    fireEvent.click(appImageItem);
    expect(openSpy).toHaveBeenLastCalledWith(
      "https://downloads.animehub.example/AnimeHub-1.4.2.AppImage",
      "_blank",
      "noopener,noreferrer",
    );

    fireEvent.click(linuxButton);
    const debItem = await screen.findByRole("menuitem", {
      name: "Paquete .deb (Ubuntu / Debian)",
    });
    fireEvent.click(debItem);
    expect(openSpy).toHaveBeenLastCalledWith(
      "https://downloads.animehub.example/animehub_1.4.2_amd64.deb",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("falls back to GitHub Releases URL in modal buttons when API returns 404", async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiResponseError(404, "Not Found"),
    );
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    render(<DesktopPromoModal isOpen onOpenChange={vi.fn()} />);

    const dialog = await screen.findByRole("alertdialog", {
      name: "AnimeHub para PC",
    });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    expect(within(dialog).getByText("Windows y Linux")).toBeVisible();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Descargar para Windows" }),
    );
    expect(openSpy).toHaveBeenLastCalledWith(
      DESKTOP_RELEASES_FALLBACK_URL,
      "_blank",
      "noopener,noreferrer",
    );

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Descargar para Linux" }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "AppImage (recomendado)" }),
    );
    expect(openSpy).toHaveBeenLastCalledWith(
      DESKTOP_RELEASES_FALLBACK_URL,
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("renders the AnimeHub para PC card inside PreferencesPanel below RemotePreferences", async () => {
    vi.mocked(apiFetch).mockResolvedValue(releaseFixture);
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    render(
      <PreferencesPanel
        preferences={{
          audio: "SUB",
          providers: ["MEGA", "PIXELDRAIN", "MP4UPLOAD"],
          destination: "CNL",
        }}
        savePreferences={vi.fn()}
        portable={false}
        effectiveDestination="CNL"
        selectedDeviceName={null}
        myJdConnected={false}
        openDeviceSettings={vi.fn()}
        remote={remoteStub()}
      />,
    );

    const linkedHeading = screen.getByRole("heading", {
      name: "Dispositivos vinculados",
    });
    const desktopHeading = screen.getByRole("heading", {
      name: "AnimeHub para PC",
    });
    expect(
      linkedHeading.compareDocumentPosition(desktopHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      await screen.findByText("Versión 1.4.2 · Windows y Linux"),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Descargar para Windows" }),
    );
    expect(openSpy).toHaveBeenCalledWith(
      "https://downloads.animehub.example/AnimeHub-Setup-1.4.2.exe",
      "_blank",
      "noopener,noreferrer",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Descargar para Linux" }),
    );
    expect(
      await screen.findByRole("menuitem", {
        name: "Paquete .deb (Ubuntu / Debian)",
      }),
    ).toBeVisible();
  });
});

describe("DownloadProvider first-download desktop promo", () => {
  it("opens once after the first completed desktop download, persists dismissal, and never reopens", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === "/desktop/releases/latest") return releaseFixture;
      return resolvedEpisode;
    });

    renderProvider();
    await waitFor(() => expect(handle.current?.deviceProfile).toBe("desktop"));
    // Does not call the release endpoint until a download actually finishes.
    expect(apiFetch).not.toHaveBeenCalledWith(
      "/desktop/releases/latest",
      expect.anything(),
      true,
      expect.anything(),
    );

    act(() => handle.current?.openDownload(episodeRequest));

    const modal = await screen.findByRole("alertdialog", {
      name: "AnimeHub para PC",
    });
    expect(
      await within(modal).findByText("Versión 1.4.2 · Windows y Linux"),
    ).toBeVisible();
    expect(localStorage.getItem(DESKTOP_PROMO_SEEN_KEY)).toBe("1");

    fireEvent.click(
      within(modal).getByRole("button", { name: "Seguir en la web" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("alertdialog", { name: "AnimeHub para PC" }),
      ).toBeNull(),
    );

    // A second completed download does not reopen the modal.
    act(() =>
      handle.current?.openDownload({
        slug: "frieren",
        title: "Frieren",
        episodeNumbers: [2],
      }),
    );
    await waitFor(() => expect(sendToClickNLoad).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByRole("alertdialog", { name: "AnimeHub para PC" }),
    ).toBeNull();
  });

  it("also triggers after a first completed COPY download on desktop", async () => {
    localStorage.setItem(
      "animehub.download-preferences",
      JSON.stringify({
        audio: "SUB",
        providers: ["MEGA"],
        destination: "COPY",
      }),
    );
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === "/desktop/releases/latest") return releaseFixture;
      return resolvedEpisode;
    });

    renderProvider();
    await waitFor(() => expect(handle.current?.destination).toBe("COPY"));

    act(() => handle.current?.openDownload(episodeRequest));

    expect(
      await screen.findByRole("alertdialog", { name: "AnimeHub para PC" }),
    ).toBeVisible();
    expect(copyLinks).toHaveBeenCalledTimes(1);
  });

  it("does not trigger on portable devices", async () => {
    vi.mocked(getDeviceProfile).mockReturnValue("portable");
    localStorage.setItem(
      "animehub.download-preferences",
      JSON.stringify({
        audio: "SUB",
        providers: ["MEGA"],
        destination: "COPY",
      }),
    );
    vi.mocked(apiFetch).mockResolvedValue(resolvedEpisode);

    renderProvider();
    await waitFor(() => expect(handle.current?.deviceProfile).toBe("portable"));

    act(() => handle.current?.openDownload(episodeRequest));
    await waitFor(() => expect(copyLinks).toHaveBeenCalledTimes(1));

    expect(
      screen.queryByRole("alertdialog", { name: "AnimeHub para PC" }),
    ).toBeNull();
    expect(localStorage.getItem(DESKTOP_PROMO_SEEN_KEY)).toBeNull();
  });

  it("does not trigger when a desktop PC is already linked", async () => {
    localStorage.setItem("animehub.remote.session.v1", "capability-token");
    localStorage.setItem(
      "animehub.remote.target.v2",
      JSON.stringify({ id: "pc-1", name: "Mi PC" }),
    );
    vi.mocked(apiFetch).mockResolvedValue(resolvedEpisode);

    renderProvider();
    await waitFor(() =>
      expect(handle.current?.pcTarget).toEqual({ id: "pc-1", name: "Mi PC" }),
    );

    act(() => handle.current?.openDownload(episodeRequest));
    await waitFor(() => expect(sendToClickNLoad).toHaveBeenCalledTimes(1));

    expect(
      screen.queryByRole("alertdialog", { name: "AnimeHub para PC" }),
    ).toBeNull();
    expect(localStorage.getItem(DESKTOP_PROMO_SEEN_KEY)).toBeNull();
  });

  it("does not trigger when remote.devices contains a linked PC even without a preferred target", async () => {
    localStorage.setItem("animehub.remote.session.v1", "capability-token");
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === "/remote/devices") {
        return {
          devices: [
            {
              id: "pc-1",
              name: "PC Casa",
              profileRevision: 1,
              profiles: [],
              lastSeenAt: "2026-11-27T12:00:00.000Z",
              online: true,
            },
            {
              id: "pc-2",
              name: "Portátil",
              profileRevision: 1,
              profiles: [],
              lastSeenAt: "2026-11-27T12:00:00.000Z",
              online: true,
            },
          ],
        };
      }
      if (path === "/remote/requests") return { requests: [] };
      if (path === "/desktop/releases/latest") return releaseFixture;
      return resolvedEpisode;
    });

    renderProvider();
    await waitFor(() => expect(handle.current?.deviceProfile).toBe("desktop"));
    act(() => handle.current?.loadPcs());
    await waitFor(() => expect(handle.current?.pcs).toHaveLength(2));

    act(() => handle.current?.openDownload(episodeRequest));
    await waitFor(() => expect(sendToClickNLoad).toHaveBeenCalledTimes(1));

    expect(
      screen.queryByRole("alertdialog", { name: "AnimeHub para PC" }),
    ).toBeNull();
  });
});
