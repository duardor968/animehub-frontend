import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { RemoteDevice, RemoteRequest } from "./remote-client";
import { RemoteDownloadDrawer, RemotePreferences } from "./remote-panels";
import type { RemoteDownloads } from "./use-remote-downloads";

const pc: RemoteDevice = {
  id: "pc1",
  name: "PC de prueba",
  profileRevision: 1,
  profiles: [{ id: "p", label: "Anime", engine: "direct", isDefault: true }],
  lastSeenAt: new Date().toISOString(),
  online: false,
};
const request: RemoteRequest = {
  id: "r1",
  deviceId: "pc1",
  animeSlug: "series",
  animeTitle: "Series",
  episodeNumbers: [4],
  profileId: "p",
  profileRevision: 1,
  engine: "direct",
  status: "pending",
  reason: null,
};
function remote(overrides: Partial<RemoteDownloads> = {}) {
  return {
    devices: [pc],
    loaded: true,
    requests: [request],
    preferred: "",
    busy: false,
    error: null,
    errorScope: "settings",
    panel: null,
    selectedRequest: null,
    canRetry: false,
    clearError: vi.fn(),
    setPanel: vi.fn(),
    view: vi.fn(),
    list: vi.fn(),
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
});
afterEach(cleanup);

it("names the sole PC once, with what a send to it would do", () => {
  const state = remote();
  render(<RemotePreferences remote={state} desktopSelected />);
  expect(screen.getAllByText("PC de prueba")).toHaveLength(1);
  expect(
    screen.getByText("Sin conexión · Los envíos quedarán pendientes"),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Ver las solicitudes recientes" }),
  );
  expect(state.list).toHaveBeenCalled();
});

it("lists the recent requests it names, each reachable by what it asks for", () => {
  const state = remote({
    panel: "requests",
    requests: [request, { ...request, id: "r2", episodeNumbers: [5] }],
  });
  render(<RemoteDownloadDrawer remote={state} openPreferences={vi.fn()} />);
  expect(
    screen.getByRole("dialog", { name: "Solicitudes recientes" }),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Ver la solicitud de Series · Ep. 5" }),
  );
  expect(state.view).toHaveBeenCalledWith("r2");
  expect(
    screen.getByRole("button", { name: "Ver la solicitud de Series · Ep. 4" }),
  ).toBeVisible();
});

it("goes back from a request to Preferencias, as linking a PC does", () => {
  const state = remote({ panel: "request", selectedRequest: "r1" });
  const openPreferences = vi.fn();
  render(
    <RemoteDownloadDrawer remote={state} openPreferences={openPreferences} />,
  );
  // Each field with its name: the anime, its episodes and where it stands.
  for (const [term, value] of [
    ["Anime", "Series"],
    ["Episodios", "Ep. 4"],
    ["Estado", "Pendiente de entrega · PC de prueba sin conexión"],
  ])
    expect(screen.getByText(term).nextElementSibling).toHaveTextContent(value);
  fireEvent.click(screen.getByRole("button", { name: "Preferencias" }));
  expect(state.setPanel).toHaveBeenCalledWith(null);
  expect(openPreferences).toHaveBeenCalled();
});
