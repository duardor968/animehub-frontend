import {
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
import { CatalogFilters } from "./catalog-filters";

const navigation = vi.hoisted(() => ({
  pathname: "/buscar",
  params: "q=one&order=title-asc&genre=accion",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.params),
  useRouter: () => ({ push: navigation.push }),
}));

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  navigation.push.mockReset();
  navigation.pathname = "/buscar";
  navigation.params = "q=one&order=title-asc&genre=accion";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ totalRecords: 12 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const categories = [
  { id: "tv", name: "TV Anime", slug: "tv-anime" },
  { id: "movie", name: "Película", slug: "pelicula" },
];
const genres = [
  { id: "action", name: "Acción", slug: "accion" },
  { id: "adventure", name: "Aventura", slug: "aventura" },
];

describe("CatalogFilters interactions", () => {
  it("keeps changes in a draft and preserves q/order when clearing and applying", async () => {
    render(
      <CatalogFilters
        categories={categories}
        genres={genres}
        years={[1990, 2026]}
        totalRecords={43}
        footer={<div>Pie</div>}
      >
        <div>Resultados</div>
      </CatalogFilters>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    const dialog = await screen.findByRole("dialog", {
      name: "Filtrar resultados",
    });

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Aventura" }));
    expect(navigation.push).not.toHaveBeenCalled();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Limpiar filtros" }),
    );
    expect(navigation.push).not.toHaveBeenCalled();

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: /Mostrar|Calculando|Aplicar/,
      }),
    );

    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(
        "/buscar?q=one&order=title-asc",
        { scroll: false },
      ),
    );
    expect(navigation.push).toHaveBeenCalledTimes(1);
  });

  it("updates the result count without navigating while the drawer is edited", async () => {
    render(
      <CatalogFilters
        categories={categories}
        genres={genres}
        years={[1990, 2026]}
        totalRecords={43}
        footer={<div>Pie</div>}
      >
        <div>Resultados</div>
      </CatalogFilters>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    const dialog = await screen.findByRole("dialog", {
      name: "Filtrar resultados",
    });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Aventura" }));

    expect(
      await within(dialog).findByRole("button", { name: "Mostrar 12 obras" }),
    ).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("keeps empty year fields controlled while values are entered and cleared", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <CatalogFilters
        categories={categories}
        genres={genres}
        years={[1990, 2026]}
        totalRecords={43}
        footer={<div>Pie</div>}
      >
        <div>Resultados</div>
      </CatalogFilters>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    const dialog = await screen.findByRole("dialog", {
      name: "Filtrar resultados",
    });
    const yearFrom = within(dialog).getByRole("textbox", {
      name: /Año desde/,
    });

    fireEvent.change(yearFrom, { target: { value: "2026" } });
    fireEvent.change(yearFrom, { target: { value: "" } });

    expect(
      warning.mock.calls.some(([message]) =>
        String(message).includes("uncontrolled to controlled"),
      ),
    ).toBe(false);
    expect(
      warning.mock.calls.some(([message]) =>
        String(message).includes("controlled to uncontrolled"),
      ),
    ).toBe(false);
  });
});
