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
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { apiFetch } from "@/lib/api/client";
import {
  isMyJdConnected,
  sendToClickNLoad,
  sendToMyJd,
} from "./download-client";
import { getDeviceProfile, isPortableDevice } from "./device-profile";
import {
  activeDownloadJobsStorageKey,
  saveActiveDownloadJobs,
} from "./download-job-storage";
import { DownloadProvider } from "./download-provider";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...original, apiFetch: vi.fn() };
});

vi.mock("./download-client", () => ({
  connectMyJd: vi.fn(),
  disconnectMyJd: vi.fn(),
  isMyJdConnected: vi.fn(() => false),
  listMyJdDevices: vi.fn(async () => []),
  providerLabels: {
    MEGA: "Mega",
    PIXELDRAIN: "Pixeldrain",
    MP4UPLOAD: "MP4Upload",
    ONE_FICHIER: "1Fichier",
  },
  sendToClickNLoad: vi.fn(async () => ({
    acceptedAt: new Date().toISOString(),
  })),
  sendToMyJd: vi.fn(),
}));

vi.mock("./device-profile", async (importOriginal) => {
  const original = await importOriginal<typeof import("./device-profile")>();
  return {
    ...original,
    getDeviceProfile: vi.fn(() => "desktop"),
    isPortableDevice: vi.fn(() => false),
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeAll(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
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
  vi.clearAllMocks();
  vi.mocked(isMyJdConnected).mockReturnValue(false);
  vi.mocked(getDeviceProfile).mockReturnValue("desktop");
  vi.mocked(isPortableDevice).mockReturnValue(false);
  vi.mocked(sendToClickNLoad).mockResolvedValue({
    acceptedAt: new Date().toISOString(),
  });
  vi.mocked(sendToMyJd).mockResolvedValue(undefined);
});

describe("DownloadProvider restored jobs", () => {
  it("resumes polling but waits for an explicit delivery action", async () => {
    const now = Date.now();
    saveActiveDownloadJobs(
      sessionStorage,
      [
        {
          id: "restored-activity",
          request: {
            slug: "otome-game-sekai-2",
            title: "Otome Game Sekai 2",
            from: 1,
            to: 12,
          },
          receipt: {
            jobId: "job-1",
            accessToken: "bearer-capability",
            expiresAt: new Date(now + 60 * 60_000).toISOString(),
          },
          destination: "CNL",
          createdAt: now - 1_000,
          current: 8,
          total: 12,
          deliveryAttempted: false,
        },
      ],
      now,
    );
    vi.mocked(apiFetch).mockResolvedValue({
      data: {
        status: "COMPLETED",
        packageName: "Otome Game Sekai 2",
        completedItems: 12,
        failedItems: 0,
        totalItems: 12,
        episodes: [
          {
            episodeNumber: 12,
            audio: "SUB",
            links: [{ provider: "MEGA", url: "https://example.com/file" }],
            errorCode: null,
          },
        ],
      },
    });

    render(
      <>
        <Toast.Provider />
        <DownloadProvider>
          <div>AnimeHub</div>
        </DownloadProvider>
      </>,
    );

    expect(
      await screen.findByRole("button", { name: "Entregar ahora" }),
    ).toBeVisible();
    expect(screen.getByText("Listo para entregar")).toBeVisible();
    expect(sendToClickNLoad).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(activeDownloadJobsStorageKey)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Entregar ahora" }));

    await waitFor(() =>
      expect(sendToClickNLoad).toHaveBeenCalledWith("Otome Game Sekai 2", [
        "https://example.com/file",
      ]),
    );
    await waitFor(() =>
      expect(sessionStorage.getItem(activeDownloadJobsStorageKey)).toBeNull(),
    );
  });

  it("survives a second reload until the user completes delivery", async () => {
    const now = Date.now();
    saveActiveDownloadJobs(
      sessionStorage,
      [
        {
          id: "restored-twice",
          request: {
            slug: "otome-game-sekai-2",
            title: "Otome Game Sekai 2",
            from: 1,
            to: 12,
          },
          receipt: {
            jobId: "job-twice",
            accessToken: "bearer-capability",
            expiresAt: new Date(now + 60 * 60_000).toISOString(),
          },
          destination: "CNL",
          createdAt: now - 1_000,
          current: 12,
          total: 12,
          deliveryAttempted: false,
        },
      ],
      now,
    );
    vi.mocked(apiFetch).mockResolvedValue({
      data: {
        status: "COMPLETED",
        packageName: "Otome Game Sekai 2",
        completedItems: 12,
        failedItems: 0,
        totalItems: 12,
        episodes: [
          {
            episodeNumber: 12,
            audio: "SUB",
            links: [{ provider: "MEGA", url: "https://example.com/file" }],
            errorCode: null,
          },
        ],
      },
    });

    const firstMount = render(
      <>
        <Toast.Provider />
        <DownloadProvider>
          <div>AnimeHub</div>
        </DownloadProvider>
      </>,
    );
    expect(
      await screen.findByRole("button", { name: "Entregar ahora" }),
    ).toBeVisible();
    firstMount.unmount();

    render(
      <>
        <Toast.Provider />
        <DownloadProvider>
          <div>AnimeHub</div>
        </DownloadProvider>
      </>,
    );

    expect(
      await screen.findByRole("button", { name: "Entregar ahora" }),
    ).toBeVisible();
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem(activeDownloadJobsStorageKey)).not.toBeNull();
  });

  it("warns when a reload interrupted an unconfirmed delivery", async () => {
    const now = Date.now();
    saveActiveDownloadJobs(
      sessionStorage,
      [
        {
          id: "ambiguous-delivery",
          request: {
            slug: "otome-game-sekai-2",
            title: "Otome Game Sekai 2",
            from: 1,
            to: 12,
          },
          receipt: {
            jobId: "job-ambiguous",
            accessToken: "bearer-capability",
            expiresAt: new Date(now + 60 * 60_000).toISOString(),
          },
          destination: "CNL",
          createdAt: now - 1_000,
          current: 12,
          total: 12,
          deliveryAttempted: true,
        },
      ],
      now,
    );
    vi.mocked(apiFetch).mockResolvedValue({
      data: {
        status: "COMPLETED",
        packageName: "Otome Game Sekai 2",
        completedItems: 12,
        failedItems: 0,
        totalItems: 12,
        episodes: [
          {
            episodeNumber: 12,
            audio: "SUB",
            links: [{ provider: "MEGA", url: "https://example.com/file" }],
            errorCode: null,
          },
        ],
      },
    });

    render(
      <>
        <Toast.Provider />
        <DownloadProvider>
          <div>AnimeHub</div>
        </DownloadProvider>
      </>,
    );

    expect(await screen.findByText("Entrega sin confirmar")).toBeVisible();
    expect(
      screen.getByText(/reintentar puede duplicar enlaces/i),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Reintentar entrega" }),
    ).toBeVisible();
  });

  it("keeps a dismissed running job in the recovery pill during polling", async () => {
    const now = Date.now();
    saveActiveDownloadJobs(
      sessionStorage,
      [
        {
          id: "dismissed-running",
          request: {
            slug: "otome-game-sekai-2",
            title: "Otome Game Sekai 2",
            from: 1,
            to: 12,
          },
          receipt: {
            jobId: "job-running",
            accessToken: "bearer-capability",
            expiresAt: new Date(now + 60 * 60_000).toISOString(),
          },
          destination: "CNL",
          createdAt: now - 1_000,
          current: 3,
          total: 12,
          deliveryAttempted: false,
        },
      ],
      now,
    );
    let resolvePoll!: (value: unknown) => void;
    vi.mocked(apiFetch).mockReturnValue(
      new Promise((resolve) => {
        resolvePoll = resolve;
      }) as ReturnType<typeof apiFetch>,
    );
    const info = vi.spyOn(toast, "info").mockReturnValue("running-toast");
    vi.spyOn(toast, "close").mockImplementation(() => undefined);

    render(
      <>
        <Toast.Provider />
        <DownloadProvider>
          <div>AnimeHub</div>
        </DownloadProvider>
      </>,
    );

    await waitFor(() => expect(info).toHaveBeenCalledTimes(1));
    const options = info.mock.calls[0]?.[1];
    expect(options?.onClose).toBeTypeOf("function");
    act(() => options?.onClose?.());
    expect(
      screen.getByRole("button", { name: "Abrir descarga pendiente" }),
    ).toHaveTextContent("Descarga en curso");

    await act(async () => {
      resolvePoll({
        data: {
          status: "RUNNING",
          packageName: "Otome Game Sekai 2",
          completedItems: 4,
          failedItems: 0,
          totalItems: 12,
          episodes: [],
        },
      });
    });

    expect(info).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Abrir descarga pendiente" }),
    ).toBeVisible();
  });

  it("cancels the scheduled poll when the provider unmounts", async () => {
    const now = Date.now();
    saveActiveDownloadJobs(
      sessionStorage,
      [
        {
          id: "unmounted-running",
          request: {
            slug: "otome-game-sekai-2",
            title: "Otome Game Sekai 2",
            from: 1,
            to: 12,
          },
          receipt: {
            jobId: "job-unmounted",
            accessToken: "bearer-capability",
            expiresAt: new Date(now + 60 * 60_000).toISOString(),
          },
          destination: "CNL",
          createdAt: now - 1_000,
          current: 3,
          total: 12,
          deliveryAttempted: false,
        },
      ],
      now,
    );
    vi.mocked(apiFetch).mockResolvedValue({
      data: {
        status: "RUNNING",
        packageName: "Otome Game Sekai 2",
        completedItems: 4,
        failedItems: 0,
        totalItems: 12,
        episodes: [],
      },
    });
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const view = render(
      <>
        <Toast.Provider />
        <DownloadProvider>
          <div>AnimeHub</div>
        </DownloadProvider>
      </>,
    );

    await waitFor(() =>
      expect(
        setTimeoutSpy.mock.calls.some(([, delay]) => delay === 1_250),
      ).toBe(true),
    );
    const pollCallIndex = setTimeoutSpy.mock.calls.findIndex(
      ([, delay]) => delay === 1_250,
    );
    const pollTimeoutId = setTimeoutSpy.mock.results[pollCallIndex]?.value;

    view.unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(pollTimeoutId);
  });

  it("stays usable when the sessionStorage getter is blocked", () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      window,
      "sessionStorage",
    );
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
    try {
      const view = render(
        <>
          <Toast.Provider />
          <DownloadProvider>
            <div>AnimeHub</div>
          </DownloadProvider>
        </>,
      );
      expect(screen.getByText("AnimeHub")).toBeVisible();
      view.unmount();
    } finally {
      if (descriptor)
        Object.defineProperty(window, "sessionStorage", descriptor);
    }
  });

  it("does not send twice when MyJDownloader is activated twice", async () => {
    const now = Date.now();
    sessionStorage.setItem("animehub.myjd.device", "device-1");
    saveActiveDownloadJobs(
      sessionStorage,
      [
        {
          id: "myjd-double-send",
          request: {
            slug: "otome-game-sekai-2",
            title: "Otome Game Sekai 2",
            from: 1,
            to: 12,
          },
          receipt: {
            jobId: "job-myjd",
            accessToken: "bearer-capability",
            expiresAt: new Date(now + 60 * 60_000).toISOString(),
          },
          destination: "MYJD",
          createdAt: now - 1_000,
          current: 12,
          total: 12,
          deliveryAttempted: false,
        },
      ],
      now,
    );
    vi.mocked(isMyJdConnected).mockReturnValue(true);
    vi.mocked(apiFetch).mockResolvedValue({
      data: {
        status: "COMPLETED",
        packageName: "Otome Game Sekai 2",
        completedItems: 12,
        failedItems: 0,
        totalItems: 12,
        episodes: [
          {
            episodeNumber: 12,
            audio: "SUB",
            links: [{ provider: "MEGA", url: "https://example.com/file" }],
            errorCode: null,
          },
        ],
      },
    });
    vi.mocked(sendToMyJd).mockImplementation(
      () => new Promise(() => undefined),
    );

    render(
      <>
        <Toast.Provider />
        <DownloadProvider>
          <div>AnimeHub</div>
        </DownloadProvider>
      </>,
    );

    const deliverButton = await screen.findByRole("button", {
      name: "Entregar ahora",
    });
    fireEvent.click(deliverButton);
    fireEvent.click(deliverButton);

    await waitFor(() => expect(sendToMyJd).toHaveBeenCalledTimes(1));
  });

  it("keeps a portable waiting-device job recoverable after closing the drawer", async () => {
    const now = Date.now();
    saveActiveDownloadJobs(
      sessionStorage,
      [
        {
          id: "portable-device-picker",
          request: {
            slug: "otome-game-sekai-2",
            title: "Otome Game Sekai 2",
            from: 1,
            to: 12,
          },
          receipt: {
            jobId: "job-portable",
            accessToken: "bearer-capability",
            expiresAt: new Date(now + 60 * 60_000).toISOString(),
          },
          destination: "MYJD",
          createdAt: now - 1_000,
          current: 12,
          total: 12,
          deliveryAttempted: false,
        },
      ],
      now,
    );
    vi.mocked(getDeviceProfile).mockReturnValue("portable");
    vi.mocked(isPortableDevice).mockReturnValue(true);
    vi.mocked(apiFetch).mockResolvedValue({
      data: {
        status: "COMPLETED",
        packageName: "Otome Game Sekai 2",
        completedItems: 12,
        failedItems: 0,
        totalItems: 12,
        episodes: [
          {
            episodeNumber: 12,
            audio: "SUB",
            links: [{ provider: "MEGA", url: "https://example.com/file" }],
            errorCode: null,
          },
        ],
      },
    });

    render(
      <>
        <Toast.Provider />
        <DownloadProvider>
          <div>AnimeHub</div>
        </DownloadProvider>
      </>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Entregar ahora" }),
    );
    const drawer = await screen.findByRole("dialog", { name: "Descargas" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Cerrar" }));

    const recovery = await screen.findByRole("button", {
      name: "Abrir descarga pendiente",
    });
    expect(recovery).toHaveTextContent("Descarga pendiente");

    fireEvent.click(recovery);
    expect(
      await screen.findByRole("dialog", { name: "Descargas" }),
    ).toBeVisible();
  });
});
