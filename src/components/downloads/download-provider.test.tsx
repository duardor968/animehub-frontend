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
  copyLinks,
  isMyJdConnected,
  sendToClickNLoad,
  sendToMyJd,
} from "./download-client";
import { getDeviceProfile, isPortableDevice } from "./device-profile";
import { ClickNLoadError } from "./download-errors";
import {
  activeDownloadJobsStorageKey,
  saveActiveDownloadJobs,
  type PersistedDownloadJob,
} from "./download-job-storage";
import { useEffect } from "react";
import {
  DownloadProvider,
  jobPollInterval,
  useDownloads,
} from "./download-provider";
import type { DownloadRequest } from "./download-types";

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
  toast.clear();
  vi.restoreAllMocks();
});

beforeAll(() => {
  // Reduced motion makes closed toasts leave the shared queue immediately,
  // so one test's toasts never leak into the next.
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
  vi.clearAllMocks();
  vi.mocked(isMyJdConnected).mockReturnValue(false);
  vi.mocked(getDeviceProfile).mockReturnValue("desktop");
  vi.mocked(isPortableDevice).mockReturnValue(false);
  vi.mocked(copyLinks).mockResolvedValue(true);
  vi.mocked(sendToClickNLoad).mockResolvedValue({
    acceptedAt: new Date().toISOString(),
  });
  vi.mocked(sendToMyJd).mockResolvedValue(undefined);
});

const range: DownloadRequest = {
  slug: "otome-game-sekai-2",
  title: "Otome Game Sekai 2",
  from: 1,
  to: 12,
};

function persist(overrides: Partial<PersistedDownloadJob> = {}) {
  const now = Date.now();
  saveActiveDownloadJobs(
    sessionStorage,
    [
      {
        id: "restored-activity",
        request: range,
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
        ...overrides,
      },
    ],
    now,
  );
}

function jobData(overrides: Record<string, unknown> = {}) {
  return {
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
      ...overrides,
    },
  };
}

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
const controls = {
  openDownload: (request: DownloadRequest) =>
    handle.current?.openDownload(request),
  getRequestStatus: (request: DownloadRequest) =>
    handle.current?.getRequestStatus(request),
};

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

/** The toast's "Anime · Ep. N" line (title and episodes are two spans). */
function summaryLine(text: string) {
  return screen.getAllByText(
    (_, element) =>
      element?.textContent === text &&
      element.querySelector(".truncate") !== null,
  );
}

function toastWith(text: string | RegExp) {
  return screen
    .getAllByRole("alertdialog")
    .find((element) => within(element).queryByText(text));
}

describe("DownloadProvider restored jobs", () => {
  it("resumes polling but waits for an explicit delivery action", async () => {
    persist();
    vi.mocked(apiFetch).mockResolvedValue(jobData());

    renderProvider();

    expect(
      await screen.findByRole("button", { name: "Enviar a JDownloader" }),
    ).toBeVisible();
    expect(screen.getByText("Enlaces listos")).toBeVisible();
    expect(summaryLine("Otome Game Sekai 2 · Ep. 1–12")[0]).toBeVisible();
    expect(sendToClickNLoad).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(activeDownloadJobsStorageKey)).not.toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Enviar a JDownloader" }),
    );

    await waitFor(() =>
      expect(sendToClickNLoad).toHaveBeenCalledWith("Otome Game Sekai 2", [
        "https://example.com/file",
      ]),
    );
    expect(await screen.findByText("Enviado a JDownloader")).toBeVisible();
    await waitFor(() =>
      expect(sessionStorage.getItem(activeDownloadJobsStorageKey)).toBeNull(),
    );
  });

  it("survives a second reload until the user completes delivery", async () => {
    persist({ current: 12 });
    vi.mocked(apiFetch).mockResolvedValue(jobData());

    const firstMount = renderProvider();
    expect(
      await screen.findByRole("button", { name: "Enviar a JDownloader" }),
    ).toBeVisible();
    firstMount.unmount();

    renderProvider();

    expect(
      await screen.findByRole("button", { name: "Enviar a JDownloader" }),
    ).toBeVisible();
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem(activeDownloadJobsStorageKey)).not.toBeNull();
  });

  it("warns when a reload interrupted an unconfirmed delivery", async () => {
    persist({ current: 12, deliveryAttempted: true });
    vi.mocked(apiFetch).mockResolvedValue(jobData());

    renderProvider();

    expect(await screen.findByText("Entrega sin confirmar")).toBeVisible();
    expect(screen.getByText(/para no duplicarlos/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
  });

  it("doesn't blame the reload for a delivery that had already failed", async () => {
    persist({ current: 12, deliveryAttempted: false, deliveryFailed: true });
    vi.mocked(apiFetch).mockResolvedValue(jobData());

    renderProvider();

    expect(await screen.findByText("Enlaces listos")).toBeVisible();
    expect(screen.getByText(/el último envío falló/i)).toBeVisible();
    expect(screen.queryByText("Entrega sin confirmar")).toBeNull();
  });

  it("updates one toast in place and keeps a dismissed job in the dock", async () => {
    persist({ current: 3 });
    let resolvePoll!: (value: unknown) => void;
    vi.mocked(apiFetch).mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePoll = resolve;
      }) as ReturnType<typeof apiFetch>,
    );

    renderProvider();

    const running = await screen.findByText("Reanudando la descarga");
    const toastElement = running.closest('[data-slot="toast"]');
    expect(toastElement).not.toBeNull();
    fireEvent.click(
      within(toastElement as HTMLElement).getByRole("button", {
        name: /close|cerrar/i,
      }),
    );

    const dock = await screen.findByRole("button", {
      name: "Mostrar descarga: Otome Game Sekai 2 · Ep. 1–12",
    });
    // Same words as the toast, counts formatted like every other count.
    expect(dock).toHaveTextContent("Reanudando la descarga · 3 de 12");

    vi.mocked(apiFetch).mockReturnValue(new Promise(() => undefined));
    await act(async () => {
      resolvePoll(
        jobData({ status: "RUNNING", completedItems: 4, episodes: [] }),
      );
    });

    expect(dock).toHaveTextContent("Buscando enlaces · 4 de 12");
    expect(screen.queryByText("Buscando enlaces")).toBeNull();
  });

  it("cancels the scheduled poll when the provider unmounts", async () => {
    persist({ current: 3 });
    vi.mocked(apiFetch).mockResolvedValue(
      jobData({ status: "RUNNING", completedItems: 4, episodes: [] }),
    );
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const view = renderProvider();

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
      const view = renderProvider();
      expect(screen.getByText("AnimeHub")).toBeVisible();
      view.unmount();
    } finally {
      if (descriptor)
        Object.defineProperty(window, "sessionStorage", descriptor);
    }
  });

  it("does not send twice when MyJDownloader is activated twice", async () => {
    sessionStorage.setItem("animehub.myjd.device", "device-1");
    persist({ current: 12, destination: "MYJD" });
    vi.mocked(isMyJdConnected).mockReturnValue(true);
    vi.mocked(apiFetch).mockResolvedValue(jobData());
    vi.mocked(sendToMyJd).mockImplementation(
      () => new Promise(() => undefined),
    );

    renderProvider();

    const deliverButton = await screen.findByRole("button", {
      name: "Enviar a MyJDownloader",
    });
    fireEvent.click(deliverButton);
    fireEvent.click(deliverButton);

    await waitFor(() => expect(sendToMyJd).toHaveBeenCalledTimes(1));
  });

  it("keeps a portable waiting-device job recoverable after closing the drawer", async () => {
    persist({ current: 12, destination: "MYJD" });
    vi.mocked(getDeviceProfile).mockReturnValue("portable");
    vi.mocked(isPortableDevice).mockReturnValue(true);
    vi.mocked(apiFetch).mockResolvedValue(jobData());

    renderProvider();

    fireEvent.click(
      await screen.findByRole("button", { name: "Enviar a MyJDownloader" }),
    );
    const drawer = await screen.findByRole("dialog", {
      name: "Conectar MyJDownloader",
    });
    expect(
      within(drawer).getByText("Otome Game Sekai 2 · Ep. 1–12"),
    ).toBeVisible();
    fireEvent.click(within(drawer).getByRole("button", { name: "Cerrar" }));

    const recovery = await screen.findByRole("button", {
      name: "Mostrar descarga: Otome Game Sekai 2 · Ep. 1–12",
    });
    expect(recovery).toHaveTextContent("Elige un dispositivo");

    fireEvent.click(recovery);
    expect(
      await screen.findByRole("dialog", { name: "Conectar MyJDownloader" }),
    ).toBeVisible();
  });
});

describe("DownloadProvider requests", () => {
  const episodeOne: DownloadRequest = {
    slug: "tensei-goblin",
    title: "Tensei Goblin",
    episodeNumbers: [1],
  };
  const resolved = {
    data: {
      packageName: "Tensei Goblin",
      episodes: [
        {
          episodeNumber: 1,
          audio: "SUB",
          links: [
            { provider: "MEGA", url: "https://mega.example/1" },
            { provider: "PIXELDRAIN", url: "https://pixeldrain.example/1" },
          ],
          errorCode: null,
        },
      ],
    },
  };

  it("names the anime and mirrors in the result", async () => {
    vi.mocked(apiFetch).mockResolvedValue(resolved);
    renderProvider();

    act(() => controls.openDownload(episodeOne));

    expect(await screen.findByText("Enviado a JDownloader")).toBeVisible();
    expect(summaryLine("Tensei Goblin · Ep. 1")[0]).toBeVisible();
    expect(
      screen.getByText(/2 enlaces \(espejos\) de 1 episodio/),
    ).toBeVisible();
  });

  it("offers copy and MyJDownloader when Click'n'Load is unreachable", async () => {
    vi.mocked(apiFetch).mockResolvedValue(resolved);
    vi.mocked(sendToClickNLoad).mockRejectedValue(
      new ClickNLoadError("unreachable"),
    );
    renderProvider();

    act(() => controls.openDownload(episodeOne));

    expect(
      await screen.findByText("No se pudo conectar con JDownloader"),
    ).toBeVisible();
    expect(screen.getByText(/red local/)).toBeVisible();
    expect(screen.queryByText(/duplicar/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Usar MyJDownloader" }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Copiar enlaces" }));

    await waitFor(() =>
      expect(copyLinks).toHaveBeenCalledWith([
        "https://mega.example/1",
        "https://pixeldrain.example/1",
      ]),
    );
    expect(await screen.findByText("Enlaces copiados")).toBeVisible();
  });

  it("shows the links when the clipboard is blocked", async () => {
    localStorage.setItem(
      "animehub.download-preferences",
      JSON.stringify({
        audio: "SUB",
        providers: ["MEGA"],
        destination: "COPY",
      }),
    );
    vi.mocked(apiFetch).mockResolvedValue(resolved);
    vi.mocked(copyLinks).mockResolvedValue(false);
    renderProvider();
    await act(async () => undefined);

    act(() => controls.openDownload(episodeOne));

    expect(await screen.findByText("Enlaces listos para copiar")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Ver enlaces" }));
    const drawer = await screen.findByRole("dialog", {
      name: "Enlaces de descarga",
    });
    expect(within(drawer).getByRole("textbox")).toHaveValue(
      "https://mega.example/1\nhttps://pixeldrain.example/1",
    );
  });

  it("does not resend a request that is still running", async () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => undefined));
    renderProvider();

    act(() => controls.openDownload(episodeOne));
    act(() => controls.openDownload(episodeOne));

    await screen.findByText("Buscando enlaces");
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(summaryLine("Tensei Goblin · Ep. 1")).toHaveLength(1);
    expect(controls.getRequestStatus(episodeOne)).toBe("resolving");
  });

  it("maps API failures to Spanish copy", async () => {
    const { ApiResponseError } = await import("@/lib/api/client");
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiResponseError(400, "No episodes match the requested scope."),
    );
    renderProvider();

    act(() => controls.openDownload(episodeOne));

    expect(await screen.findByText("Solicitud no válida")).toBeVisible();
    expect(
      screen.getByText("Ningún episodio coincide con los números indicados."),
    ).toBeVisible();
    expect(screen.queryByText(/No episodes match/)).toBeNull();
  });

  it("sends large selections as an explicit episode list", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path.endsWith("/download-jobs"))
        return {
          data: {
            jobId: "job-e",
            accessToken: "token",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            missingEpisodeNumbers: [51],
          },
        };
      return new Promise(() => undefined);
    });
    renderProvider();
    const episodeNumbers = Array.from({ length: 51 }, (_, index) => index + 1);

    act(() =>
      controls.openDownload({
        slug: "one-piece",
        title: "One Piece",
        episodeNumbers,
      }),
    );

    expect(
      await screen.findByText("Se omitió el episodio 51: no existe."),
    ).toBeVisible();
    const create = vi
      .mocked(apiFetch)
      .mock.calls.find(([path]) => path.endsWith("/download-jobs"));
    const body = JSON.parse(String(create?.[1]?.body));
    expect(body).toMatchObject({ scope: "EPISODES", episodeNumbers });
    expect(body).not.toHaveProperty("from");
  });

  it("refuses lists beyond what a job accepts", async () => {
    renderProvider();

    act(() =>
      controls.openDownload({
        slug: "one-piece",
        title: "One Piece",
        episodeNumbers: Array.from({ length: 5_001 }, (_, index) => index),
      }),
    );

    expect(await screen.findByText("Selección demasiado grande")).toBeVisible();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("sends ranges with ordered bounds and can cancel the job", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path.endsWith("/download-jobs"))
        return {
          data: {
            jobId: "job-9",
            accessToken: "token",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          },
        };
      if (path.endsWith("/cancel")) return { data: { status: "CANCELLED" } };
      expect(init?.headers).toEqual({ authorization: "Bearer token" });
      return jobData({ status: "RUNNING", completedItems: 2, episodes: [] });
    });
    renderProvider();

    act(() =>
      controls.openDownload({ ...range, slug: "one-piece", from: 9, to: 4 }),
    );

    await screen.findByText("2 de 12");
    const create = vi
      .mocked(apiFetch)
      .mock.calls.find(([path]) => path.endsWith("/download-jobs"));
    expect(JSON.parse(String(create?.[1]?.body))).toMatchObject({
      scope: "RANGE",
      from: 4,
      to: 9,
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(await screen.findByText("Descarga cancelada")).toBeVisible();
    expect(apiFetch).toHaveBeenCalledWith(
      "/download-jobs/job-9/cancel",
      expect.objectContaining({ method: "POST" }),
      true,
    );
  });

  it("retries only the failed episodes of a partial job", async () => {
    let retried = false;
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path.endsWith("/download-jobs"))
        return {
          data: {
            jobId: "job-p",
            accessToken: "token",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          },
        };
      if (path.endsWith("/retry")) {
        retried = true;
        return { data: {} };
      }
      const episodes = [1, 2, 3].map((episodeNumber) => ({
        episodeNumber,
        audio: "SUB",
        links:
          episodeNumber === 2 && !retried
            ? []
            : [
                {
                  provider: "MEGA",
                  url: `https://mega.example/${episodeNumber}`,
                },
              ],
        errorCode:
          episodeNumber === 2 && !retried ? "NO_SUPPORTED_LINKS" : null,
      }));
      return jobData({
        status: retried ? "COMPLETED" : "PARTIAL",
        completedItems: retried ? 3 : 2,
        failedItems: retried ? 0 : 1,
        totalItems: 3,
        episodes,
      });
    });
    renderProvider();

    act(() =>
      controls.openDownload({ ...range, slug: "one-piece", from: 1, to: 3 }),
    );

    expect(await screen.findByText("Entrega parcial")).toBeVisible();
    expect(screen.getByText(/El episodio 2 no tiene enlaces/)).toBeVisible();
    expect(sendToClickNLoad).toHaveBeenLastCalledWith("Otome Game Sekai 2", [
      "https://mega.example/1",
      "https://mega.example/3",
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: "Reintentar fallidos" }),
    );

    expect(await screen.findByText("Enviado a JDownloader")).toBeVisible();
    expect(sendToClickNLoad).toHaveBeenLastCalledWith("Otome Game Sekai 2", [
      "https://mega.example/2",
    ]);
    expect(toastWith("Entrega parcial")).toBeUndefined();
  });
});

describe("DownloadProvider job requests", () => {
  const receipt = (jobId = "job-k") => ({
    data: {
      jobId,
      accessToken: `token-${jobId}`,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      missingEpisodeNumbers: [],
    },
  });
  const keyOf = (call: unknown[]) =>
    ((call[1] as RequestInit | undefined)?.headers as Record<string, string>)?.[
      "idempotency-key"
    ];
  const jobPosts = () =>
    vi
      .mocked(apiFetch)
      .mock.calls.filter(([path]) => String(path).endsWith("/download-jobs"));

  it("sends an Idempotency-Key and reuses it when retrying an unknown outcome", async () => {
    const { ApiConnectionError } = await import("@/lib/api/client");
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiConnectionError());
    vi.mocked(apiFetch).mockImplementation(async (path) =>
      String(path).endsWith("/download-jobs")
        ? receipt()
        : new Promise(() => undefined),
    );
    renderProvider();

    act(() => controls.openDownload({ ...range, slug: "one-piece" }));
    expect(await screen.findByText("Sin conexión con AnimeHub")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(jobPosts()).toHaveLength(2));
    const [first, second] = jobPosts().map(keyOf);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    // The API returns the job the first attempt may have created.
    expect(second).toBe(first);
  });

  it("starts over with a new key when the old one conflicts (422)", async () => {
    const { ApiResponseError } = await import("@/lib/api/client");
    vi.mocked(apiFetch)
      .mockRejectedValueOnce(new ApiResponseError(422, "Key reused"))
      .mockResolvedValueOnce(receipt())
      .mockReturnValue(new Promise(() => undefined));
    renderProvider();

    act(() => controls.openDownload({ ...range, slug: "one-piece" }));

    await waitFor(() => expect(jobPosts()).toHaveLength(2));
    const [first, second] = jobPosts().map(keyOf);
    expect(second).not.toBe(first);
    expect(await screen.findByText("Buscando enlaces")).toBeVisible();
  });

  it("cancels the job an abandoned request may have created", async () => {
    let posts = 0;
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (String(path).endsWith("/download-jobs")) {
        posts += 1;
        // The first request never answers; the repeat returns the job.
        if (posts === 1)
          return new Promise((_, reject) =>
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            ),
          );
        return receipt("job-orphan");
      }
      return { data: { status: "CANCELLED" } };
    });
    renderProvider();

    act(() => controls.openDownload({ ...range, slug: "one-piece" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

    expect(await screen.findByText("Descarga cancelada")).toBeVisible();
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/download-jobs/job-orphan/cancel",
        expect.objectContaining({
          method: "POST",
          headers: { authorization: "Bearer token-job-orphan" },
        }),
        true,
        expect.anything(),
      ),
    );
    const [first, second] = jobPosts().map(keyOf);
    expect(second).toBe(first);
  });

  it("keeps delivering when the job finished before the cancel arrived", async () => {
    let polls = 0;
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (String(path).endsWith("/download-jobs")) return receipt("job-done");
      if (String(path).endsWith("/cancel"))
        return { data: { status: "COMPLETED" } };
      polls += 1;
      return polls === 1
        ? jobData({ status: "RUNNING", completedItems: 2, episodes: [] })
        : jobData();
    });
    renderProvider();

    act(() => controls.openDownload({ ...range, slug: "one-piece" }));
    await screen.findByText("2 de 12");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(await screen.findByText("Enviado a JDownloader")).toBeVisible();
    expect(sendToClickNLoad).toHaveBeenCalled();
    expect(screen.queryByText("Descarga cancelada")).toBeNull();
  });

  it("waits out a rate limit without reporting a lost connection", async () => {
    const { ApiResponseError } = await import("@/lib/api/client");
    let polls = 0;
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (String(path).endsWith("/download-jobs")) return receipt("job-429");
      polls += 1;
      if (polls === 1)
        return jobData({ status: "RUNNING", completedItems: 2, episodes: [] });
      if (polls === 2)
        throw new ApiResponseError(429, "Too Many Requests", 7_000);
      return new Promise(() => undefined);
    });
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    renderProvider();

    act(() => controls.openDownload({ ...range, slug: "one-piece" }));
    await screen.findByText("2 de 12");
    // The second poll runs after the regular 1.25 s and gets the 429.
    await waitFor(
      () =>
        expect(
          setTimeoutSpy.mock.calls.some(([, delay]) => delay === 7_000),
        ).toBe(true),
      { timeout: 3_000 },
    );
    expect(screen.getByText("Buscando enlaces")).toBeVisible();
    expect(screen.queryByText("Reconectando con la descarga")).toBeNull();
  });

  it("doesn't offer to retry a request the API rejected as invalid", async () => {
    const { ApiResponseError } = await import("@/lib/api/client");
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiResponseError(400, "No episodes match the requested scope."),
    );
    renderProvider();

    act(() => controls.openDownload({ ...range, slug: "one-piece" }));

    expect(await screen.findByText("Solicitud no válida")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
  });

  it("polls big jobs less often", () => {
    expect(jobPollInterval(12)).toBe(1_250);
    expect(jobPollInterval(120)).toBe(2_000);
    expect(jobPollInterval(400)).toBe(3_000);
    expect(jobPollInterval(1_180)).toBe(5_000);
  });
});

describe("DownloadProvider drawer", () => {
  it("loads the drawer on first open and keeps it for later opens", async () => {
    renderProvider();
    // Nothing of the drawer is rendered (or loaded) before it opens.
    expect(document.querySelector(".drawer-state-trigger")).toBeNull();

    act(() => handle.current?.openSettings());
    const drawer = await screen.findByRole("dialog", {
      name: "Preferencias de descarga",
    });
    expect(
      within(drawer).getByRole("radiogroup", {
        name: "Destino de los enlaces",
      }),
    ).toBeVisible();
    fireEvent.click(within(drawer).getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.querySelector(".drawer-state-trigger")).not.toBeNull();

    act(() => handle.current?.openSettings());
    expect(
      await screen.findByRole("dialog", { name: "Preferencias de descarga" }),
    ).toBeVisible();
  });
});
