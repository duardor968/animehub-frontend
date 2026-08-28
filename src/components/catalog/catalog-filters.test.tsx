import "@testing-library/jest-dom/vitest";
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
  params: "q=one&order=title&genre=accion",
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.params),
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
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
  navigation.replace.mockReset();
  navigation.pathname = "/buscar";
  navigation.params = "q=one&order=title&genre=accion";
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
  it("removes unknown taxonomy values instead of creating invisible filters", async () => {
    navigation.params = "q=one&genre=__invalid__&category=unknown";
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

    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith("/buscar?q=one", {
        scroll: false,
      }),
    );
    expect(screen.getByRole("button", { name: "Filtros" })).toBeTruthy();
    expect(
      screen.queryByRole("grid", { name: "Filtros aplicados" }),
    ).toBeNull();
  });

  it("canonicalizes the source default and redundant page values out of the URL", async () => {
    navigation.params = "q=one&order=latest_added&page=1";
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

    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith("/buscar?q=one", {
        scroll: false,
      }),
    );
  });

  it("exposes concise names for sorting, chips, and both year thumbs", async () => {
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

    expect(
      screen.getByRole("button", {
        name: "Título A–Z Ordenar catálogo",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: /Ordenar catálogo Ordenar/,
      }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Quitar Acción" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Quitar Acción Acción" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    const dialog = await screen.findByRole("dialog", {
      name: "Filtrar resultados",
    });
    expect(
      within(dialog).getByRole("slider", { name: /^Año inicial/ }),
    ).toHaveAttribute("value", "1990");
    expect(
      within(dialog).getByRole("slider", { name: /^Año final/ }),
    ).toHaveAttribute("value", "2026");
    expect(
      within(dialog).queryByRole("textbox", { name: /Año (desde|hasta)/ }),
    ).toBeNull();
  });

  it("composes HeroUI groups with each control before its label", async () => {
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
    const formatGroup = dialog.querySelector(
      '[data-slot="checkbox-group"]',
    ) as HTMLElement;
    const formatContent = formatGroup.querySelector(
      '[data-slot="checkbox-content"]',
    );
    const stateGroup = within(dialog).getByRole("radiogroup", {
      name: /^Estado$/,
    });
    const stateContent = stateGroup.querySelector(
      '[data-slot="radio-content"]',
    );
    const formatControl = formatContent?.querySelector(
      '[data-slot="checkbox-control"]',
    );
    const formatLabel = formatContent?.querySelector('[data-slot="label"]');
    const stateControl = stateContent?.querySelector(
      '[data-slot="radio-control"]',
    );
    const stateLabel = stateContent?.querySelector('[data-slot="label"]');

    expect(formatControl).not.toBeNull();
    expect(formatLabel).not.toBeNull();
    expect(stateControl).not.toBeNull();
    expect(stateLabel).not.toBeNull();
    expect(
      formatControl!.compareDocumentPosition(formatLabel!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      stateControl!.compareDocumentPosition(stateLabel!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(formatControl).toHaveAttribute("data-slot", "checkbox-control");
    expect(stateGroup).toHaveAttribute("data-orientation", "horizontal");
    expect(stateControl).toHaveAttribute("data-slot", "radio-control");
  });

  it("navigates with the source-backed key when the sort changes", async () => {
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

    fireEvent.click(
      screen.getByRole("button", { name: "Título A–Z Ordenar catálogo" }),
    );
    fireEvent.click(
      await screen.findByRole("option", { name: "Mejor puntuación" }),
    );

    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(
        "/buscar?q=one&genre=accion&order=score",
        { scroll: false },
      ),
    );
  });

  it("removes an applied chip without dropping search or order", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Quitar Acción" }));

    expect(navigation.push).toHaveBeenCalledWith("/buscar?q=one&order=title", {
      scroll: false,
    });
  });

  it("restores the applied draft whenever the drawer is reopened", async () => {
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
    let dialog = await screen.findByRole("dialog", {
      name: "Filtrar resultados",
    });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Aventura" }));
    expect(
      within(dialog).getByRole("checkbox", { name: "Aventura" }),
    ).toBeChecked();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Cerrar filtros" }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    dialog = await screen.findByRole("dialog", {
      name: "Filtrar resultados",
    });
    expect(
      within(dialog).getByRole("checkbox", { name: "Aventura" }),
    ).not.toBeChecked();
    expect(
      within(dialog).getByRole("checkbox", { name: "Acción" }),
    ).toBeChecked();
  });

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
        "/buscar?q=one&order=title",
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

  it("surfaces a failed preview and lets the user retry it", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("preview unavailable"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ totalRecords: 12 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
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

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "No se pudo calcular el total.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Aplicar filtros" }),
    ).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Reintentar" }));
    expect(
      await within(dialog).findByRole("button", { name: "Mostrar 12 obras" }),
    ).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps the dual year slider controlled without React state warnings", async () => {
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
    const yearFrom = within(dialog).getByRole("slider", {
      name: /^Año inicial/,
    });
    const yearTo = within(dialog).getByRole("slider", {
      name: /^Año final/,
    });

    expect(yearFrom).toHaveAttribute("min", "1990");
    expect(yearFrom).toHaveAttribute("max", "2026");
    expect(yearTo).toHaveAttribute("min", "1990");
    expect(yearTo).toHaveAttribute("max", "2026");

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
