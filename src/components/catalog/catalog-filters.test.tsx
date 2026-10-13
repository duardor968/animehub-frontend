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
import { act, type ComponentProps } from "react";
import { CatalogFilters } from "./catalog-filters";
import { useCatalogNavigation } from "./catalog-navigation";

const navigation = vi.hoisted(() => ({
  pathname: "/buscar",
  params: "q=one&order=title&genre=accion",
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

function filters(props: Partial<ComponentProps<typeof CatalogFilters>> = {}) {
  return (
    <CatalogFilters
      scope="search"
      categories={categories}
      genres={genres}
      years={[1990, 2026]}
      totalRecords={43}
      footer={<div>Pie</div>}
      {...props}
    >
      <div>Resultados</div>
    </CatalogFilters>
  );
}

async function openDrawer() {
  fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
  return screen.findByRole("dialog", { name: "Filtros" });
}

const group = (dialog: HTMLElement, name: string) =>
  within(dialog).getByRole("grid", { name });

const chip = (dialog: HTMLElement, groupName: string, name: string) =>
  within(group(dialog, groupName)).getByRole("row", { name });

const applyButton = (dialog: HTMLElement) =>
  within(dialog).getByRole("button", {
    name: /Mostrar|Calculando|Aplicar|Sin resultados/,
  });

describe("CatalogFilters interactions", () => {
  it("names the sort, the chips, the groups and both year thumbs", async () => {
    render(filters());

    expect(
      screen.getByRole("button", { name: "Título A–Z Ordenar" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quitar Acción" })).toBeTruthy();

    const dialog = await openDrawer();
    for (const name of ["Formato", "Estado", "Inicial", "Género"])
      expect(group(dialog, name)).toBeTruthy();
    expect(
      within(dialog).getByRole("slider", { name: /^Año inicial/ }),
    ).toHaveAttribute("value", "1990");
    expect(
      within(dialog).getByRole("slider", { name: /^Año final/ }),
    ).toHaveAttribute("value", "2026");
  });

  it("navigates with the source-backed key when the sort changes", async () => {
    render(filters());

    fireEvent.click(screen.getByRole("button", { name: "Título A–Z Ordenar" }));
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

  it("labels each chip's remove button with a tooltip", async () => {
    render(filters());
    const remove = screen.getByRole("button", { name: "Quitar Acción" });

    fireEvent.pointerMove(remove, { pointerType: "mouse" });
    fireEvent.pointerEnter(remove, { pointerType: "mouse" });

    await waitFor(() => expect(remove).toHaveAccessibleDescription("Quitar"));
  });

  it("removes an applied chip without dropping search or order", () => {
    render(filters());

    fireEvent.click(screen.getByRole("button", { name: "Quitar Acción" }));

    expect(navigation.push).toHaveBeenCalledWith("/buscar?q=one&order=title", {
      scroll: false,
    });
  });

  it.each(["Cerrar", "Escape"])(
    "drops an unapplied draft when the drawer is dismissed (%s)",
    async (how) => {
      render(filters());

      let dialog = await openDrawer();
      fireEvent.click(chip(dialog, "Género", "Aventura"));
      fireEvent.click(chip(dialog, "Formato", "Película"));
      if (how === "Escape") fireEvent.keyDown(dialog, { key: "Escape" });
      else
        fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

      // It reopens on the applied filters.
      dialog = await openDrawer();
      expect(chip(dialog, "Género", "Acción")).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(chip(dialog, "Género", "Aventura")).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(chip(dialog, "Formato", "Película")).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(navigation.push).not.toHaveBeenCalled();
    },
  );

  it("closes the drawer on the first Escape from a selected chip", async () => {
    render(filters());
    let dialog = await openDrawer();
    const selectedChip = chip(dialog, "Género", "Acción");

    act(() => selectedChip.focus());
    fireEvent.keyDown(selectedChip, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    dialog = await openDrawer();
    expect(chip(dialog, "Género", "Acción")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it.each(["Cerrar", "Limpiar búsqueda"])(
    "labels the drawer's %s button with the same tooltip",
    async (name) => {
      render(filters());
      const dialog = await openDrawer();
      fireEvent.change(
        within(dialog).getByRole("searchbox", { name: "Buscar género" }),
        { target: { value: "acc" } },
      );
      const button = within(dialog).getByRole("button", { name });

      fireEvent.pointerMove(button, { pointerType: "mouse" });
      fireEvent.pointerEnter(button, { pointerType: "mouse" });

      // The open tooltip describes its trigger.
      await waitFor(() => expect(button).toHaveAccessibleDescription(name));
    },
  );

  it("starts the draft from the latest applied filters", async () => {
    const { rerender } = render(filters());
    let dialog = await openDrawer();
    fireEvent.click(chip(dialog, "Género", "Aventura"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));

    navigation.params = "q=one&order=title";
    rerender(filters({ totalRecords: 50 }));
    dialog = await openDrawer();
    expect(
      within(group(dialog, "Género"))
        .getAllByRole("row")
        .filter((row) => row.getAttribute("aria-selected") === "true"),
    ).toHaveLength(0);
  });

  it("clears a single-choice filter by pressing its selected chip", async () => {
    render(filters());
    const dialog = await openDrawer();

    fireEvent.click(chip(dialog, "Género", "Acción"));
    expect(chip(dialog, "Género", "Acción")).toHaveAttribute(
      "aria-selected",
      "false",
    );
    fireEvent.click(applyButton(dialog));

    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(
        "/buscar?q=one&order=title",
        { scroll: false },
      ),
    );
  });

  it("filters by initial, including numbers and symbols", async () => {
    render(filters({ scope: "catalog" }));
    const dialog = await openDrawer();

    expect(within(group(dialog, "Inicial")).getAllByRole("row")).toHaveLength(
      27,
    );
    fireEvent.click(chip(dialog, "Inicial", "Números y símbolos"));
    fireEvent.click(applyButton(dialog));

    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(
        "/buscar?q=one&genre=accion&letter=%23&order=title",
        { scroll: false },
      ),
    );
  });

  it("hides sorting and the chip row's clear action without results", () => {
    render(filters({ totalRecords: 0 }));

    expect(screen.getByRole("button", { name: "Filtros" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ordenar/ })).toBeNull();
    // The empty state below the chips offers "Limpiar filtros" instead.
    expect(
      screen.queryByRole("button", { name: "Limpiar filtros" }),
    ).toBeNull();
  });

  it("states a capped total once, without instructions", () => {
    render(filters({ scope: "catalog", totalRecords: 1000, capped: true }));

    expect(screen.getAllByText(/1000/)).toHaveLength(1);
    expect(screen.getByText("Más de 1000 obras")).toBeTruthy();
  });

  it("keeps changes in a draft and preserves q/order when clearing and applying", async () => {
    render(filters());
    const dialog = await openDrawer();

    fireEvent.click(chip(dialog, "Género", "Aventura"));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Limpiar filtros" }),
    );
    expect(navigation.push).not.toHaveBeenCalled();

    fireEvent.click(applyButton(dialog));

    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(
        "/buscar?q=one&order=title",
        { scroll: false },
      ),
    );
    expect(navigation.push).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the apply button when clearing disables itself", async () => {
    render(filters());
    const dialog = await openDrawer();
    const clear = within(dialog).getByRole("button", {
      name: "Limpiar filtros",
    });

    clear.focus();
    fireEvent.click(clear);

    expect(clear).toBeDisabled();
    expect(document.activeElement).toBe(applyButton(dialog));
  });

  it("applies only a changed draft, checking it without navigating", async () => {
    render(filters());
    const dialog = await openDrawer();
    const apply = within(dialog).getByRole("button", {
      name: "Aplicar filtros",
    });
    expect(apply).toBeDisabled();

    fireEvent.click(chip(dialog, "Género", "Aventura"));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(apply).toBeEnabled();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("disables applying a draft that matches no works", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ totalRecords: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    render(filters());
    const dialog = await openDrawer();
    fireEvent.click(chip(dialog, "Género", "Aventura"));

    expect(
      await within(dialog).findByRole("button", { name: "Sin resultados" }),
    ).toBeDisabled();
  });

  it("still applies the draft when its count is unavailable", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("preview unavailable"));
    render(filters());
    const dialog = await openDrawer();
    fireEvent.click(chip(dialog, "Género", "Aventura"));

    fireEvent.click(
      await within(dialog).findByRole("button", { name: "Aplicar filtros" }),
    );

    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(
        "/buscar?q=one&genre=aventura&order=title",
        { scroll: false },
      ),
    );
  });

  it("keeps the dual year slider controlled without React state warnings", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(filters());
    const dialog = await openDrawer();

    for (const name of [/^Año inicial/, /^Año final/]) {
      const thumb = within(dialog).getByRole("slider", { name });
      expect(thumb).toHaveAttribute("min", "1990");
      expect(thumb).toHaveAttribute("max", "2026");
    }
    expect(
      warning.mock.calls.some(([message]) =>
        /uncontrolled to controlled|controlled to uncontrolled/.test(
          String(message),
        ),
      ),
    ).toBe(false);
  });

  it("keeps keyboard focus while results load and lands it on the results", async () => {
    let finish!: () => void;
    navigation.push.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    function Pager() {
      const catalogNavigation = useCatalogNavigation();
      return (
        <button
          type="button"
          onClick={() =>
            catalogNavigation?.navigate("/buscar?q=one&page=2", {
              scroll: true,
              focusResults: true,
            })
          }
        >
          Página 2
        </button>
      );
    }
    render(filters({ footer: <Pager /> }));

    const pager = screen.getByRole("button", { name: "Página 2" });
    pager.focus();
    fireEvent.click(pager);

    // While loading, "Filtros" is pending, not disabled (focus may return to
    // it from the drawer), and the focused control keeps focus.
    const filtersButton = screen.getByRole("button", { name: /^Filtros/ });
    await waitFor(() =>
      expect(filtersButton).toHaveAttribute("aria-disabled", "true"),
    );
    expect(filtersButton).not.toBeDisabled();
    expect(document.activeElement).toBe(pager);

    await act(async () => finish());
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("region", { name: "Resultados de la búsqueda" }),
      ),
    );
  });
});
