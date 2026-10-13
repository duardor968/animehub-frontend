"use client";

import {
  Button,
  Drawer,
  Label,
  ListBox,
  SearchField,
  Select,
  Slider,
  Tag,
  TagGroup,
  Tooltip,
  Typography,
  useOverlayState,
  type Key,
  type Selection,
} from "@heroui/react";
import { SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import type { components } from "@/lib/api/generated";
import { formatNumber, plural } from "@/lib/format";
import {
  catalogHref,
  catalogLetters,
  catalogSortOptions,
  catalogStatusOptions,
  clearCatalogFilters,
  countCatalogFilters,
  formatCatalogCount,
  getSelectedFilters,
  getYearBounds,
  letterLabel,
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

const defaultSortLabel: Record<CatalogScope, string> = {
  catalog: "Últimos agregados",
  search: "Relevancia",
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
  const headingId = useId();
  const router = useRouter();
  const pathname = usePathname();
  const current = useSearchParams();
  const bounds = useMemo(() => getYearBounds(years), [years]);
  const currentKey = current.toString();
  const appliedParams = useMemo(
    () =>
      normalizeCatalogParams(new URLSearchParams(currentKey), bounds, {
        allowedCategories: new Set(categories.map((item) => item.slug)),
        allowedGenres: new Set(genres.map((item) => item.slug)),
      }),
    [bounds, categories, currentKey, genres],
  );
  const appliedKey = appliedParams.toString();
  // The drawer edits a draft that starts from the applied filters on every
  // opening: closing without applying (outside click, Escape, ×) drops it.
  const [draft, setDraft] = useState(appliedParams);
  const [genreQuery, setGenreQuery] = useState("");
  const openFilters = () => {
    setDraft(appliedParams);
    setGenreQuery("");
    drawer.open();
  };
  // The draft's result count, keyed by its query; null when it failed.
  const [preview, setPreview] = useState<{
    key: string;
    result: { count: number; capped: boolean } | null;
  } | null>(null);
  const [isNavigationPending, startNavigation] = useTransition();
  const [hasNavigated, setHasNavigated] = useState(false);
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const applyButtonRef = useRef<HTMLButtonElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  // Where keyboard focus goes once a navigation lands (see navigate()).
  const focusAfterRef = useRef<"results" | "if-lost" | null>(null);

  useEffect(() => {
    const intent = focusAfterRef.current;
    if (isNavigationPending || !intent) return;
    focusAfterRef.current = null;
    if (intent === "results") {
      resultsRef.current?.focus({ preventScroll: true });
      return;
    }
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected)
      filtersButtonRef.current?.focus({ preventScroll: true });
  }, [isNavigationPending, appliedKey]);

  const draftKey = draft.toString();
  const draftMatchesApplied = draftKey === appliedKey;
  const draftPreview = preview?.key === draftKey ? preview : null;
  const result = draftMatchesApplied
    ? { count: totalRecords, capped }
    : (draftPreview?.result ?? null);
  const isPreviewPending =
    drawer.isOpen && !draftMatchesApplied && !draftPreview;

  // Result count for the draft, debounced: "Mostrar N obras" before applying.
  useEffect(() => {
    if (!drawer.isOpen || draftMatchesApplied) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams(draftKey);
      query.set("scope", scope);
      fetch(`/api/catalog-preview?${query}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then((response) => {
          if (!response.ok) throw new Error("Catalog preview unavailable");
          return response.json() as Promise<{
            totalRecords: number;
            capped?: boolean;
          }>;
        })
        .then((data) =>
          setPreview({
            key: draftKey,
            result: { count: data.totalRecords, capped: data.capped === true },
          }),
        )
        .catch(() => {
          if (!controller.signal.aborted)
            setPreview({ key: draftKey, result: null });
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [draftKey, draftMatchesApplied, drawer.isOpen, scope]);

  const selected = useMemo(
    () => getSelectedFilters(appliedParams, categories, genres, bounds),
    [appliedParams, bounds, categories, genres],
  );

  const navigation = useMemo<CatalogNavigation>(
    () => ({
      isPending: isNavigationPending,
      navigate: (href, options) => {
        if (isNavigationPending) return;
        setHasNavigated(true);
        focusAfterRef.current = options?.focusResults ? "results" : "if-lost";
        startNavigation(() =>
          router.push(href, { scroll: options?.scroll ?? false }),
        );
      },
    }),
    [isNavigationPending, router],
  );

  const navigate = (params: URLSearchParams) =>
    navigation.navigate(catalogHref(pathname, params));

  const removeSelected = (keys: Set<Key>) => {
    const next = new URLSearchParams(appliedParams);
    for (const entry of selected.filter((item) => keys.has(item.id))) {
      if (entry.key === "years") {
        next.delete("minYear");
        next.delete("maxYear");
      } else next.delete(entry.key, entry.value);
    }
    navigate(next);
  };

  const applyFilters = () => {
    drawer.close();
    navigate(draft);
  };

  // The button that was pressed becomes disabled: hand focus to the next
  // step instead of letting it fall back to the page.
  const clearDraft = () => {
    setDraft((params) => clearCatalogFilters(params, bounds));
    applyButtonRef.current?.focus();
  };

  const applyLabel = isPreviewPending
    ? "Calculando…"
    : !result
      ? "Aplicar filtros"
      : result.count === 0
        ? "Sin resultados"
        : result.capped
          ? `Mostrar más de ${formatNumber(result.count)} obras`
          : `Mostrar ${plural(result.count, "obra", "obras")}`;

  const countText = formatCatalogCount(totalRecords, capped);

  return (
    <CatalogNavigationContext value={navigation}>
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {/* Pending, not disabled, while results load: focus returns here
            when the drawer closes and must not be dropped. */}
          <Button
            ref={filtersButtonRef}
            variant="secondary"
            onPress={openFilters}
            isPending={isNavigationPending}
          >
            <SlidersHorizontal aria-hidden="true" />
            Filtros
          </Button>
          <p className="text-sm tabular-nums text-muted">{countText}</p>
          {totalRecords > 0 && (
            <Select
              aria-label="Ordenar"
              className="w-56 max-sm:w-full sm:ml-auto"
              variant="secondary"
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
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {[
                    ["", defaultSortLabel[scope]] as const,
                    ...catalogSortOptions,
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

        {selected.length > 0 && (
          // As tall as "Limpiar filtros": the chips stay put when it hides.
          <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2">
            <TagGroup aria-label="Filtros aplicados" onRemove={removeSelected}>
              <TagGroup.List>
                {selected.map((entry) => (
                  <Tag key={entry.id} id={entry.id} textValue={entry.label}>
                    {/* A render function: HeroUI only takes a remove button
                        that is a direct child, and here a Tooltip wraps it.
                        Its name adds the chip's: "Quitar Acción". */}
                    {() => (
                      <>
                        {entry.label}
                        <Tooltip delay={300}>
                          <Tag.RemoveButton aria-label="Quitar" />
                          <Tooltip.Content>Quitar</Tooltip.Content>
                        </Tooltip>
                      </>
                    )}
                  </Tag>
                ))}
              </TagGroup.List>
            </TagGroup>
            {/* With no results the empty state offers the same exit. */}
            {totalRecords > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onPress={() =>
                  navigate(clearCatalogFilters(appliedParams, bounds))
                }
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        )}
      </div>

      <Drawer.Backdrop isOpen={drawer.isOpen} onOpenChange={drawer.setOpen}>
        <Drawer.Content placement="left">
          <Drawer.Dialog aria-labelledby={headingId}>
            <Tooltip delay={300}>
              <Drawer.CloseTrigger aria-label="Cerrar" />
              <Tooltip.Content>Cerrar</Tooltip.Content>
            </Tooltip>
            <Drawer.Header>
              <Typography type="h3" id={headingId}>
                Filtros
              </Typography>
            </Drawer.Header>
            <Drawer.Body>
              <FilterPanel
                params={draft}
                categories={categories}
                genres={genres}
                bounds={bounds}
                genreQuery={genreQuery}
                setGenreQuery={setGenreQuery}
                setParams={setDraft}
              />
            </Drawer.Body>
            {/* Stacked: "Mostrar más de 1000 obras" and "Limpiar filtros"
                don't fit side by side in the drawer's width. */}
            <Drawer.Footer className="flex-col">
              <Button
                ref={applyButtonRef}
                fullWidth
                className="tabular-nums"
                onPress={applyFilters}
                isDisabled={result?.count === 0}
                isPending={isNavigationPending}
              >
                {applyLabel}
              </Button>
              <Button
                fullWidth
                variant="ghost"
                onPress={clearDraft}
                isDisabled={countCatalogFilters(draft) === 0}
              >
                Limpiar filtros
              </Button>
              <span className="sr-only" role="status">
                {isPreviewPending ? "" : applyLabel}
              </span>
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>

      <div
        ref={resultsRef}
        tabIndex={-1}
        role="region"
        aria-label={
          scope === "search"
            ? "Resultados de la búsqueda"
            : "Obras del catálogo"
        }
        aria-busy={isNavigationPending}
        className={`outline-none transition-opacity duration-150 ${isNavigationPending ? "pointer-events-none opacity-50" : ""}`}
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
  setParams,
}: {
  params: URLSearchParams;
  categories: Category[];
  genres: Category[];
  bounds: YearBounds;
  genreQuery: string;
  setGenreQuery: (value: string) => void;
  setParams: (update: (params: URLSearchParams) => URLSearchParams) => void;
}) {
  const normalizedGenreQuery = normalizeForSearch(genreQuery);
  const filteredGenres = genres.filter((genre) =>
    normalizeForSearch(genre.name).includes(normalizedGenreQuery),
  );
  const selectedKeys = (key: string) => new Set(params.getAll(key));
  // Single-select chips: pressing the selected one empties the selection,
  // which clears the filter.
  const selectOne = (key: "genre" | "status" | "letter") => (keys: Selection) =>
    setParams((draft) =>
      setCatalogParam(
        draft,
        key,
        keys === "all" ? "" : String([...keys][0] ?? ""),
        bounds,
      ),
    );

  // escapeKeyBehavior="none" on every group: Escape closes the drawer at once
  // instead of first clearing the focused group's selection.
  return (
    <div className="flex flex-col gap-6">
      <TagGroup
        escapeKeyBehavior="none"
        selectionMode="multiple"
        selectedKeys={selectedKeys("category")}
        onSelectionChange={(keys) =>
          setParams((draft) =>
            setCatalogMulti(
              draft,
              "category",
              keys === "all"
                ? categories.map((item) => item.slug)
                : [...keys].map(String),
              bounds,
            ),
          )
        }
      >
        <Label>Formato</Label>
        <TagGroup.List>
          {categories.map((item) => (
            <Tag key={item.slug} id={item.slug}>
              {item.name}
            </Tag>
          ))}
        </TagGroup.List>
      </TagGroup>

      <TagGroup
        escapeKeyBehavior="none"
        selectionMode="single"
        selectedKeys={selectedKeys("status")}
        onSelectionChange={selectOne("status")}
      >
        <Label>Estado</Label>
        <TagGroup.List>
          {catalogStatusOptions.map(([value, label]) => (
            <Tag key={value} id={value}>
              {label}
            </Tag>
          ))}
        </TagGroup.List>
      </TagGroup>

      <Slider
        value={[
          Number(params.get("minYear") ?? bounds.min),
          Number(params.get("maxYear") ?? bounds.max),
        ]}
        minValue={bounds.min}
        maxValue={bounds.max}
        // Years are not quantities: "1999", never "1.999".
        formatOptions={{ useGrouping: false }}
        onChange={(value) => {
          if (Array.isArray(value))
            setParams((draft) =>
              setCatalogYearRange(draft, [value[0], value[1]], bounds),
            );
        }}
      >
        <Label>Año</Label>
        <Slider.Output />
        <Slider.Track>
          <Slider.Fill />
          <Slider.Thumb index={0} aria-label="Año inicial" />
          <Slider.Thumb index={1} aria-label="Año final" />
        </Slider.Track>
      </Slider>

      <TagGroup
        escapeKeyBehavior="none"
        selectionMode="single"
        selectedKeys={selectedKeys("letter")}
        onSelectionChange={selectOne("letter")}
      >
        <Label>Inicial</Label>
        {/* Equal cells in columns, never narrower than tall. */}
        <TagGroup.List className="grid grid-cols-[repeat(auto-fill,minmax(2rem,1fr))]">
          {catalogLetters.map((letter) => (
            <Tag
              key={letter}
              id={letter}
              className="justify-center"
              textValue={
                letter === "#" ? "Números y símbolos" : letterLabel(letter)
              }
            >
              {letterLabel(letter)}
            </Tag>
          ))}
        </TagGroup.List>
      </TagGroup>

      <TagGroup
        escapeKeyBehavior="none"
        selectionMode="single"
        selectedKeys={selectedKeys("genre")}
        onSelectionChange={selectOne("genre")}
      >
        <Label>Género</Label>
        <SearchField
          aria-label="Buscar género"
          className="mb-1"
          variant="secondary"
          value={genreQuery}
          onChange={setGenreQuery}
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Buscar género…" />
            <Tooltip delay={300}>
              <SearchField.ClearButton aria-label="Limpiar búsqueda" />
              <Tooltip.Content>Limpiar búsqueda</Tooltip.Content>
            </Tooltip>
          </SearchField.Group>
        </SearchField>
        <TagGroup.List renderEmptyState={() => "Ningún género coincide."}>
          {filteredGenres.map((item) => (
            <Tag key={item.slug} id={item.slug}>
              {item.name}
            </Tag>
          ))}
        </TagGroup.List>
      </TagGroup>
    </div>
  );
}
