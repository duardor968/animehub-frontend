"use client";

import {
  Button,
  Checkbox,
  CheckboxGroup,
  Disclosure,
  Drawer,
  Label,
  ListBox,
  Radio,
  RadioGroup,
  SearchField,
  Select,
  Slider,
  Tag,
  TagGroup,
  useOverlayState,
} from "@heroui/react";
import {
  ChevronDown,
  ListFilter,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type Key,
  type ReactNode,
} from "react";
import {
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
} from "react-aria-components";
import type { components } from "@/lib/api/generated";
import { formatNumber, plural } from "@/lib/format";
import {
  catalogHref,
  catalogLetters,
  catalogStatusOptions,
  getSelectedFilters,
  letterLabel,
  clearCatalogFilters,
  countCatalogFilters,
  formatCatalogCount,
  getYearBounds,
  normalizeCatalogParams,
  normalizeForSearch,
  setCatalogMulti,
  setCatalogParam,
  setCatalogYearRange,
  type CatalogScope,
  type YearBounds,
} from "./catalog-filter-params";
import {
  CatalogNavigationContext,
  type CatalogNavigation,
} from "./catalog-navigation";

type Category = components["schemas"]["CategoryDto"];

// The default ("") differs per scope: the catalog lists the newest additions,
// search keeps the source's relevance order (exact title first, then newest).
const sortOptions = [
  ["score", "Mejor puntuación"],
  ["popular", "Más populares"],
  ["title", "Título A–Z"],
  ["latest_released", "Últimos emitidos"],
] as const;
const defaultSortLabel: Record<CatalogScope, string> = {
  catalog: "Últimos agregados",
  search: "Relevancia",
};

const letterSectionId = "catalog-filter-letter";

type Preview = {
  key: string;
  count: number | null;
  capped: boolean;
  status: "loading" | "ready" | "failed";
};

export function CatalogFilters({
  scope,
  categories,
  genres,
  years,
  totalRecords,
  capped = false,
  children,
  footer,
}: {
  scope: CatalogScope;
  categories: Category[];
  genres: Category[];
  years: number[];
  totalRecords: number;
  capped?: boolean;
  children: ReactNode;
  footer: ReactNode;
}) {
  const drawer = useOverlayState();
  const router = useRouter();
  const pathname = usePathname();
  const current = useSearchParams();
  const bounds = useMemo(() => getYearBounds(years), [years]);
  const allowedCategories = useMemo(
    () => new Set(categories.map((category) => category.slug)),
    [categories],
  );
  const allowedGenres = useMemo(
    () => new Set(genres.map((genre) => genre.slug)),
    [genres],
  );
  const currentKey = current.toString();
  const appliedParams = useMemo(
    () =>
      normalizeCatalogParams(new URLSearchParams(currentKey), bounds, {
        allowedCategories,
        allowedGenres,
      }),
    [allowedCategories, allowedGenres, bounds, currentKey],
  );
  const appliedKey = appliedParams.toString();
  // The draft survives closing the drawer (outside click, Escape, ×) and is
  // only rebased when the applied filters change, e.g. after removing a chip.
  const [draftState, setDraftState] = useState(() => ({
    base: appliedKey,
    params: new URLSearchParams(appliedParams),
  }));
  const draft =
    draftState.base === appliedKey ? draftState.params : appliedParams;
  const setDraft = (update: (params: URLSearchParams) => URLSearchParams) =>
    setDraftState((state) => ({
      base: appliedKey,
      params: update(state.base === appliedKey ? state.params : appliedParams),
    }));
  const [genreQuery, setGenreQuery] = useState("");
  const [preview, setPreview] = useState<Preview>(() => ({
    key: appliedKey,
    count: totalRecords,
    capped,
    status: "ready",
  }));
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [isNavigationPending, startNavigation] = useTransition();
  const [hasNavigated, setHasNavigated] = useState(false);
  const draftKey = draft.toString();
  const draftMatchesApplied = draftKey === appliedKey;
  const isPreviewPending = Boolean(
    drawer.isOpen &&
    !draftMatchesApplied &&
    (preview.key !== draftKey || preview.status === "loading"),
  );
  const previewResult = draftMatchesApplied
    ? { count: totalRecords, capped }
    : preview.key === draftKey && preview.count !== null
      ? { count: preview.count, capped: preview.capped }
      : null;

  useEffect(() => {
    if (!drawer.isOpen || draftMatchesApplied) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setPreview({
        key: draftKey,
        count: null,
        capped: false,
        status: "loading",
      });
      const query = new URLSearchParams(draft);
      query.set("scope", scope);
      void fetch(`/api/catalog-preview?${query}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Catalog preview unavailable");
          return response.json() as Promise<{
            totalRecords: number;
            capped?: boolean;
          }>;
        })
        .then((result) => {
          if (controller.signal.aborted) return;
          setPreview({
            key: draftKey,
            count: result.totalRecords,
            capped: result.capped === true,
            status: "ready",
          });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setPreview((currentPreview) =>
            currentPreview.key === draftKey
              ? { key: draftKey, count: null, capped: false, status: "failed" }
              : currentPreview,
          );
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    draft,
    draftKey,
    draftMatchesApplied,
    drawer.isOpen,
    previewAttempt,
    scope,
  ]);

  const selected = useMemo(
    () => getSelectedFilters(appliedParams, categories, genres, bounds),
    [appliedParams, bounds, categories, genres],
  );
  const appliedFilterCount = countCatalogFilters(appliedParams);

  const navigation = useMemo<CatalogNavigation>(
    () => ({
      isPending: isNavigationPending,
      navigate: (href, options) => {
        if (isNavigationPending) return;
        setHasNavigated(true);
        startNavigation(() =>
          router.push(href, { scroll: options?.scroll ?? false }),
        );
      },
    }),
    [isNavigationPending, router],
  );

  const navigate = (params: URLSearchParams) =>
    navigation.navigate(
      catalogHref(pathname, normalizeCatalogParams(params, bounds)),
    );

  const removeSelected = (keys: Set<Key>) => {
    if (isNavigationPending) return;
    const next = new URLSearchParams(appliedParams);
    for (const id of keys) {
      const entry = selected.find((item) => item.id === String(id));
      if (!entry) continue;
      if (entry.key === "years") {
        next.delete("minYear");
        next.delete("maxYear");
      } else if (entry.key === "category") {
        const remaining = next
          .getAll(entry.key)
          .filter((value) => value !== entry.value);
        next.delete(entry.key);
        remaining.forEach((value) => next.append(entry.key, value));
      } else {
        next.delete(entry.key);
      }
    }
    navigate(next);
  };

  const clearApplied = () =>
    navigate(clearCatalogFilters(appliedParams, bounds));

  const openDrawer = (section?: string) => {
    drawer.open();
    if (!section) return;
    // Wait for the drawer to mount, then bring the section into view.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const element = document.getElementById(section);
        element?.scrollIntoView({ block: "start" });
        element
          ?.querySelector<HTMLInputElement>(
            "input[type=radio]:checked, input[type=radio]",
          )
          ?.focus({ preventScroll: true });
      }),
    );
  };

  const applyFilters = () => {
    if (isNavigationPending) return;
    drawer.close();
    navigate(draft);
  };

  const applyLabel = isPreviewPending
    ? "Calculando…"
    : preview.key === draftKey && preview.status === "failed"
      ? "Aplicar filtros"
      : previewResult === null
        ? "Mostrar resultados"
        : previewResult.capped
          ? `Mostrar ${formatNumber(previewResult.count)}+ obras`
          : `Mostrar ${plural(previewResult.count, "obra", "obras")}`;

  const countText = formatCatalogCount(totalRecords, capped);

  return (
    <CatalogNavigationContext value={navigation}>
      <div className="min-w-0">
        <div className="mb-6 rounded-2xl border border-white/8 bg-surface px-3 py-3 shadow-[0_18px_45px_rgb(0_0_0/0.12)] sm:px-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <Button
              onPress={() => openDrawer()}
              className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-none transition-colors hover:bg-accent-hover"
              isDisabled={isNavigationPending}
            >
              <SlidersHorizontal size={17} aria-hidden="true" />
              <span>Filtros</span>
              {appliedFilterCount > 0 && (
                <>
                  <span
                    aria-hidden="true"
                    className="grid min-w-5 place-items-center rounded-full bg-white/16 px-1.5 py-0.5 text-[11px] tabular-nums"
                  >
                    {appliedFilterCount}
                  </span>
                  <span className="sr-only">
                    , {appliedFilterCount}{" "}
                    {appliedFilterCount === 1 ? "activo" : "activos"}
                  </span>
                </>
              )}
            </Button>

            <p className="text-sm tabular-nums text-muted">
              {capped && "Más de "}
              <strong className="font-semibold text-subtle">
                {formatNumber(totalRecords)}
              </strong>{" "}
              {totalRecords === 1 ? "obra" : "obras"}
            </p>

            {totalRecords > 0 && (
              <Select
                aria-label={
                  scope === "search" ? "Ordenar resultados" : "Ordenar catálogo"
                }
                className="ml-auto w-56 max-sm:w-full"
                value={appliedParams.get("order") ?? ""}
                onChange={(key) =>
                  navigate(
                    setCatalogParam(
                      appliedParams,
                      "order",
                      String(key ?? ""),
                      bounds,
                    ),
                  )
                }
                variant="secondary"
                isDisabled={isNavigationPending}
              >
                <Select.Trigger className="h-11 items-center rounded-xl border border-white/8 bg-surface-secondary text-sm text-foreground shadow-none">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {[
                      ["", defaultSortLabel[scope]] as const,
                      ...sortOptions,
                    ].map(([id, label]) => (
                      <ListBox.Item key={id} id={id} textValue={label}>
                        {label}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            )}
          </div>

          {capped && (
            <p className="mt-3 border-t border-white/7 pt-3 text-xs leading-5 text-muted">
              Solo se pueden recorrer las primeras {formatNumber(totalRecords)}.
              Filtra por formato, género o{" "}
              <button
                type="button"
                onClick={() => openDrawer(letterSectionId)}
                disabled={isNavigationPending}
                className="rounded font-semibold text-link underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus"
              >
                inicial
              </button>{" "}
              para llegar al resto.
            </p>
          )}

          {selected.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/7 pt-3">
              <TagGroup
                aria-label="Filtros aplicados"
                onRemove={removeSelected}
                className="contents"
              >
                <TagGroup.List className="flex flex-wrap gap-2">
                  {selected.map((entry) => (
                    <Tag
                      id={entry.id}
                      key={entry.id}
                      variant="surface"
                      className="min-h-9 gap-1 rounded-xl border border-white/8 bg-surface-hover py-0 pl-3 pr-1 text-xs font-medium text-subtle pointer-coarse:min-h-11 pointer-coarse:pr-0"
                    >
                      {entry.label}
                      <Tag.RemoveButton
                        aria-label="Quitar"
                        className="grid size-7 place-items-center rounded-lg text-muted transition-colors hover:bg-white/8 hover:text-foreground pointer-coarse:size-11 [&_svg]:!size-3.5"
                      >
                        <X size={14} aria-hidden="true" />
                      </Tag.RemoveButton>
                    </Tag>
                  ))}
                </TagGroup.List>
              </TagGroup>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-9 px-2 text-xs font-semibold text-link pointer-coarse:min-h-11"
                onPress={clearApplied}
                isDisabled={isNavigationPending}
              >
                Limpiar filtros
              </Button>
            </div>
          )}
        </div>

        <Drawer state={drawer}>
          <Drawer.Trigger className="drawer-state-trigger" aria-hidden="true">
            Abrir filtros
          </Drawer.Trigger>
          <Drawer.Backdrop
            variant="transparent"
            className="mobile-drawer-backdrop z-[60] !bg-background/76"
          >
            <Drawer.Content
              placement="left"
              className="mobile-drawer-content z-[70]"
            >
              <Drawer.Dialog className="mobile-drawer-dialog !w-[min(100vw,27rem)] !max-w-[27rem] overflow-hidden border-r border-white/10 bg-background-secondary !p-0 text-foreground shadow-[24px_0_70px_rgb(0_0_0/0.36)]">
                <Drawer.Header className="mobile-drawer-header flex shrink-0 items-start justify-between border-b border-white/8 px-5 py-5 sm:px-6">
                  <div>
                    <span className="eyebrow">
                      {scope === "search" ? "Búsqueda" : "Catálogo"}
                    </span>
                    <Drawer.Heading className="mt-1 text-xl font-semibold tracking-[-.02em]">
                      Filtrar resultados
                    </Drawer.Heading>
                  </div>
                  <Drawer.CloseTrigger
                    className="grid size-11 shrink-0 place-items-center rounded-xl text-muted outline-none transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus"
                    aria-label="Cerrar filtros"
                  >
                    <X size={18} aria-hidden="true" />
                  </Drawer.CloseTrigger>
                </Drawer.Header>
                <Drawer.Body className="mobile-drawer-body min-h-0 overflow-y-auto px-5 py-1 sm:px-6">
                  <FilterPanel
                    params={draft}
                    categories={categories}
                    genres={genres}
                    bounds={bounds}
                    genreQuery={genreQuery}
                    setGenreQuery={setGenreQuery}
                    setCategories={(values) =>
                      setDraft((params) =>
                        setCatalogMulti(params, "category", values, bounds),
                      )
                    }
                    setOne={(key, value) =>
                      setDraft((params) =>
                        setCatalogParam(params, key, value, bounds),
                      )
                    }
                    setYearRange={(value) =>
                      setDraft((params) =>
                        setCatalogYearRange(params, value, bounds),
                      )
                    }
                  />
                </Drawer.Body>
                <Drawer.Footer className="mobile-drawer-footer sticky bottom-0 z-10 grid shrink-0 grid-cols-[minmax(0,.8fr)_minmax(0,1.35fr)] gap-3 border-t border-white/8 bg-background-secondary px-5 py-4 sm:px-6">
                  {preview.key === draftKey &&
                    preview.status === "failed" &&
                    !draftMatchesApplied && (
                      <div
                        className="col-span-2 flex min-h-9 items-center justify-between gap-3 rounded-lg bg-danger-soft px-3 text-xs text-danger-soft-foreground"
                        role="alert"
                      >
                        <span>No se pudo calcular el total.</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="min-h-8 shrink-0 px-2 text-xs font-semibold text-danger-soft-foreground pointer-coarse:min-h-11"
                          onPress={() =>
                            setPreviewAttempt((attempt) => attempt + 1)
                          }
                        >
                          Reintentar
                        </Button>
                      </div>
                    )}
                  <Button
                    variant="secondary"
                    className="h-11 w-full items-center justify-center rounded-xl border border-white/10 bg-surface px-3 text-sm font-semibold leading-none text-subtle shadow-none"
                    onPress={() =>
                      setDraft((params) => clearCatalogFilters(params, bounds))
                    }
                    isDisabled={
                      countCatalogFilters(draft) === 0 || isNavigationPending
                    }
                  >
                    Limpiar filtros
                  </Button>
                  <Button
                    className="h-11 w-full items-center justify-center whitespace-nowrap rounded-xl bg-accent px-3 text-sm font-semibold leading-none tabular-nums text-accent-foreground shadow-none hover:bg-accent-hover"
                    onPress={applyFilters}
                    isDisabled={isNavigationPending}
                  >
                    {applyLabel}
                  </Button>
                  <span className="sr-only" aria-live="polite" role="status">
                    {isPreviewPending
                      ? "Calculando cantidad de resultados"
                      : applyLabel}
                  </span>
                </Drawer.Footer>
              </Drawer.Dialog>
            </Drawer.Content>
          </Drawer.Backdrop>
        </Drawer>

        <div
          aria-busy={isNavigationPending}
          className={`transition-opacity duration-150 ${isNavigationPending ? "pointer-events-none opacity-55" : "opacity-100"}`}
        >
          {children}
          {footer}
        </div>
        {/* One polite region: announces progress, then the new count once a
            user-initiated change lands (never on the initial page load). */}
        <span className="sr-only" role="status">
          {isNavigationPending
            ? "Actualizando resultados…"
            : hasNavigated
              ? `${countText} ${totalRecords === 1 && !capped ? "encontrada" : "encontradas"}`
              : ""}
        </span>
      </div>
    </CatalogNavigationContext>
  );
}

function FilterPanel({
  params,
  categories,
  genres,
  bounds,
  genreQuery,
  setGenreQuery,
  setCategories,
  setOne,
  setYearRange,
}: {
  params: URLSearchParams;
  categories: Category[];
  genres: Category[];
  bounds: YearBounds;
  genreQuery: string;
  setGenreQuery: (value: string) => void;
  setCategories: (values: string[]) => void;
  setOne: (key: "genre" | "status" | "letter", value: string) => void;
  setYearRange: (value: [number, number]) => void;
}) {
  const normalizedGenreQuery = normalizeForSearch(genreQuery);
  const filteredGenres = genres.filter((genre) =>
    normalizeForSearch(genre.name).includes(normalizedGenreQuery),
  );
  const yearRange: [number, number] = [
    Number(params.get("minYear") ?? bounds.min),
    Number(params.get("maxYear") ?? bounds.max),
  ];

  return (
    <div className="divide-y divide-white/8">
      <FilterDisclosure
        title="Formato"
        count={params.getAll("category").length}
        className="first:pt-5"
      >
        <CheckboxGroup
          value={params.getAll("category")}
          onChange={setCategories}
          variant="secondary"
          className="!grid grid-cols-2 !gap-1 max-[360px]:grid-cols-1 [&_[data-slot=checkbox]]:!mt-0"
        >
          <Label className="sr-only">Formato</Label>
          {categories.map((item) => (
            <FilterCheckbox key={item.id} label={item.name} value={item.slug} />
          ))}
        </CheckboxGroup>
      </FilterDisclosure>

      <FilterDisclosure title="Estado" count={params.has("status") ? 1 : 0}>
        <RadioGroup
          value={params.get("status") ?? ""}
          onChange={(value) => setOne("status", value)}
          orientation="horizontal"
          variant="secondary"
          className="!grid grid-cols-2 !gap-1 max-[360px]:grid-cols-1 [&_[data-slot=radio]]:!mt-0"
        >
          <Label className="sr-only">Estado</Label>
          {catalogStatusOptions.map(([value, label]) => (
            <FilterRadio key={value || "any"} value={value} label={label} />
          ))}
        </RadioGroup>
      </FilterDisclosure>

      <FilterDisclosure
        title="Año"
        count={Number(params.has("minYear") || params.has("maxYear"))}
      >
        <div className="rounded-xl bg-surface px-3.5 py-3">
          <Slider
            value={yearRange}
            minValue={bounds.min}
            maxValue={bounds.max}
            step={1}
            // Years are not quantities: "1999", never "1,999" or "1.999".
            formatOptions={{ useGrouping: false }}
            onChange={(value) => {
              if (!Array.isArray(value) || value.length !== 2) return;
              setYearRange([value[0], value[1]]);
            }}
            className="gap-y-3"
          >
            <Label className="text-xs font-medium text-muted">
              Rango de años
            </Label>
            <Slider.Output className="text-sm font-semibold tabular-nums text-foreground">
              {yearRange[0] === yearRange[1]
                ? String(yearRange[0])
                : `${yearRange[0]} – ${yearRange[1]}`}
            </Slider.Output>
            <Slider.Track className="!h-6 !rounded-full !border-x-[10px] !border-x-transparent !bg-surface-secondary">
              <Slider.Fill className="rounded-full bg-brand" />
              {(["Año inicial", "Año final"] as const).map((label, index) => (
                <Slider.Thumb
                  key={label}
                  index={index}
                  aria-label={label}
                  className="!size-7 !w-7 !rounded-full !bg-transparent after:!size-4 after:!rounded-full after:!bg-foreground pointer-coarse:!size-11 pointer-coarse:!w-11 pointer-coarse:after:!size-5"
                />
              ))}
            </Slider.Track>
          </Slider>
          <div
            aria-hidden="true"
            className="mt-1 flex justify-between px-0.5 text-[11px] tabular-nums text-faint"
          >
            <span>{bounds.min}</span>
            <span>{bounds.max}</span>
          </div>
        </div>
        {(params.has("minYear") || params.has("maxYear")) && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 h-9 items-center justify-start px-1 text-xs font-semibold leading-none text-link pointer-coarse:h-11"
            onPress={() => setYearRange([bounds.min, bounds.max])}
          >
            Cualquier año
          </Button>
        )}
      </FilterDisclosure>

      <FilterDisclosure
        id={letterSectionId}
        title="Inicial"
        count={params.has("letter") ? 1 : 0}
      >
        <AriaRadioGroup
          aria-label="Inicial del título"
          value={params.get("letter") ?? ""}
          onChange={(value) => setOne("letter", value)}
          orientation="horizontal"
          className="grid grid-cols-7 gap-1.5 max-[380px]:grid-cols-6"
        >
          {["", ...catalogLetters].map((letter) => (
            <AriaRadio
              key={letter || "all"}
              value={letter}
              aria-label={
                letter === ""
                  ? "Todas las iniciales"
                  : letter === "#"
                    ? "Números y símbolos"
                    : undefined
              }
              className={({ isSelected, isFocusVisible, isHovered }) =>
                `grid h-10 cursor-pointer place-items-center rounded-lg text-sm font-semibold tabular-nums transition-colors pointer-coarse:h-11 ${
                  isSelected
                    ? "bg-accent text-accent-foreground"
                    : isHovered
                      ? "bg-surface-hover text-foreground"
                      : "bg-surface text-subtle"
                } ${letter === "" ? "text-xs" : ""} ${
                  isFocusVisible
                    ? "ring-2 ring-focus ring-offset-1 ring-offset-background-secondary"
                    : ""
                }`
              }
            >
              {letter === "" ? "Todas" : letterLabel(letter)}
            </AriaRadio>
          ))}
        </AriaRadioGroup>
      </FilterDisclosure>

      <FilterDisclosure title="Género" count={params.has("genre") ? 1 : 0}>
        <SearchField
          aria-label="Buscar género"
          value={genreQuery}
          onChange={setGenreQuery}
          className="w-full"
          variant="secondary"
        >
          <SearchField.Group className="h-11 rounded-xl border border-white/8 bg-surface-secondary shadow-none">
            <SearchField.SearchIcon>
              <Search size={16} aria-hidden="true" />
            </SearchField.SearchIcon>
            <SearchField.Input
              placeholder="Buscar género"
              className="text-base sm:text-sm"
            />
            <SearchField.ClearButton aria-label="Borrar búsqueda de género" />
          </SearchField.Group>
        </SearchField>
        <RadioGroup
          value={params.get("genre") ?? ""}
          onChange={(value) => setOne("genre", value)}
          orientation="horizontal"
          variant="secondary"
          className="mt-3 !grid grid-cols-2 !gap-1 max-[360px]:grid-cols-1 [&_[data-slot=radio]]:!mt-0"
        >
          <Label className="sr-only">Género</Label>
          {!normalizedGenreQuery && (
            <FilterRadio value="" label="Cualquier género" />
          )}
          {filteredGenres.map((item) => (
            <FilterRadio key={item.id} value={item.slug} label={item.name} />
          ))}
        </RadioGroup>
        {filteredGenres.length === 0 && (
          <div className="py-8 text-center">
            <ListFilter
              size={20}
              className="mx-auto text-faint"
              aria-hidden="true"
            />
            <p className="mt-2 text-sm text-muted">
              No hay géneros que coincidan.
            </p>
          </div>
        )}
      </FilterDisclosure>
    </div>
  );
}

// Unselected controls get a visible outline: the theme's field border is
// transparent, which left them at 1.14:1 against the drawer (WCAG 1.4.11).
const controlClass =
  "shrink-0 border-[1.5px] border-faint transition-colors group-data-[selected=true]/option:border-accent";

const optionClass =
  "group/option !mt-0 min-h-11 w-full justify-center rounded-lg px-2.5 transition-colors hover:bg-white/[.035] data-[selected=true]:bg-accent-soft";

const optionContentClass =
  "flex min-h-11 w-full min-w-0 items-center gap-2.5 py-1.5 text-left text-sm leading-5 text-subtle data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-focus data-[focus-visible=true]:ring-offset-1 data-[focus-visible=true]:ring-offset-background-secondary";

function FilterRadio({ value, label }: { value: string; label: string }) {
  return (
    <Radio value={value} className={optionClass}>
      <Radio.Content className={optionContentClass}>
        <Radio.Control className={controlClass}>
          <Radio.Indicator />
        </Radio.Control>
        <Label className="min-w-0 flex-1 break-words">{label}</Label>
      </Radio.Content>
    </Radio>
  );
}

function FilterCheckbox({ label, value }: { label: string; value: string }) {
  return (
    <Checkbox value={value} className={optionClass}>
      <Checkbox.Content className={optionContentClass}>
        <Checkbox.Control className={controlClass}>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Label className="min-w-0 flex-1 break-words">{label}</Label>
      </Checkbox.Content>
    </Checkbox>
  );
}

function FilterDisclosure({
  id,
  title,
  count = 0,
  className = "",
  children,
}: {
  id?: string;
  title: string;
  count?: number;
  className?: string;
  children: ReactNode;
}) {
  const disclosure = (
    <Disclosure defaultExpanded className={`py-5 ${className}`}>
      <Disclosure.Heading>
        <Disclosure.Trigger className="flex min-h-11 w-full items-center gap-2 rounded-lg text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus">
          <span>{title}</span>
          {count > 0 && (
            <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-[11px] tabular-nums text-link">
              {count}
              <span className="sr-only"> seleccionado</span>
            </span>
          )}
          <Disclosure.Indicator className="ml-auto size-4 text-muted">
            <ChevronDown size={16} aria-hidden="true" />
          </Disclosure.Indicator>
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="pt-3">{children}</Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
  return id ? (
    <div id={id} className="scroll-mt-2">
      {disclosure}
    </div>
  ) : (
    disclosure
  );
}
