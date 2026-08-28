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
  type ReactNode,
} from "react";
import type { components } from "@/lib/api/generated";
import {
  clearCatalogFilters,
  countCatalogFilters,
  getYearBounds,
  normalizeCatalogParams,
  normalizeForSearch,
  setCatalogMulti,
  setCatalogParam,
  setCatalogYearRange,
  toCatalogApiParams,
  validateYearRange,
  type YearBounds,
} from "./catalog-filter-params";

type Category = components["schemas"]["CategoryDto"];

const statusOptions = [
  ["", "Cualquier estado"],
  ["emision", "En emisión"],
  ["finalizado", "Finalizado"],
  ["proximamente", "Próximamente"],
] as const;

type SelectedFilter = {
  id: string;
  key: "category" | "genre" | "status" | "years" | "letter";
  value: string;
  label: string;
};

export function CatalogFilters({
  categories,
  genres,
  years,
  totalRecords,
  children,
  footer,
}: {
  categories: Category[];
  genres: Category[];
  years: number[];
  totalRecords: number;
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
  const canonicalCurrentWithPage = useMemo(
    () =>
      normalizeCatalogParams(new URLSearchParams(currentKey), bounds, {
        keepPage: true,
        allowedCategories,
        allowedGenres,
      }),
    [allowedCategories, allowedGenres, bounds, currentKey],
  );
  const [draft, setDraft] = useState(() => new URLSearchParams(appliedParams));
  const [genreQuery, setGenreQuery] = useState("");
  const [preview, setPreview] = useState<{
    key: string;
    count: number | null;
    status: "loading" | "ready" | "failed";
  }>(() => ({
    key: appliedParams.toString(),
    count: totalRecords,
    status: "ready",
  }));
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [isNavigationPending, startNavigation] = useTransition();
  const draftKey = draft.toString();
  const yearError = validateYearRange(draft);
  const draftMatchesApplied = draftKey === appliedParams.toString();
  const isPreviewPending = Boolean(
    drawer.isOpen &&
    !yearError &&
    !draftMatchesApplied &&
    (preview.key !== draftKey || preview.status === "loading"),
  );
  const previewCount = draftMatchesApplied
    ? totalRecords
    : preview.key === draftKey
      ? preview.count
      : null;

  useEffect(() => {
    if (currentKey === canonicalCurrentWithPage.toString()) return;
    const target = `${pathname}${canonicalCurrentWithPage.size ? `?${canonicalCurrentWithPage}` : ""}`;
    router.replace(target, { scroll: false });
  }, [canonicalCurrentWithPage, currentKey, pathname, router]);

  useEffect(() => {
    if (!drawer.isOpen || yearError || draftMatchesApplied) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setPreview({ key: draftKey, count: null, status: "loading" });
      void fetch(`/api/catalog-preview?${toCatalogApiParams(draft)}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Catalog preview unavailable");
          return response.json() as Promise<{ totalRecords: number }>;
        })
        .then(({ totalRecords: nextTotalRecords }) => {
          if (controller.signal.aborted) return;
          setPreview({
            key: draftKey,
            count: nextTotalRecords,
            status: "ready",
          });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setPreview((currentPreview) =>
            currentPreview.key === draftKey
              ? { key: draftKey, count: null, status: "failed" }
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
    yearError,
  ]);

  const selected = useMemo(
    () => getSelectedFilters(appliedParams, categories, genres, bounds),
    [appliedParams, bounds, categories, genres],
  );
  const appliedFilterCount = countCatalogFilters(appliedParams);

  const navigate = (params: URLSearchParams) => {
    if (isNavigationPending) return;
    const next = normalizeCatalogParams(params, bounds);
    const target = `${pathname}${next.size ? `?${next}` : ""}`;
    startNavigation(() => router.push(target, { scroll: false }));
  };

  const openFilters = () => {
    setDraft(new URLSearchParams(appliedParams));
    setGenreQuery("");
  };

  const removeSelected = (keys: Set<React.Key>) => {
    if (isNavigationPending) return;
    const next = new URLSearchParams(appliedParams);
    for (const id of keys) {
      const entry = selected.find((item) => item.id === String(id));
      if (!entry) continue;
      if (entry.key === "years") {
        next.delete("minYear");
        next.delete("maxYear");
      } else if (entry.key === "status" || entry.key === "letter") {
        next.delete(entry.key);
      } else {
        const remaining = next
          .getAll(entry.key)
          .filter((value) => value !== entry.value);
        next.delete(entry.key);
        remaining.forEach((value) => next.append(entry.key, value));
      }
    }
    navigate(next);
  };

  const clearApplied = () =>
    navigate(clearCatalogFilters(appliedParams, bounds));

  const updateDraft = (key: "category" | "genre", values: string[]) =>
    setDraft((params) => setCatalogMulti(params, key, values, bounds));

  const setDraftValue = (key: "status", value: string) =>
    setDraft((params) => setCatalogParam(params, key, value, bounds));

  const setDraftYearRange = (value: [number, number]) =>
    setDraft((params) => setCatalogYearRange(params, value, bounds));

  const applyFilters = () => {
    if (yearError || isNavigationPending) return;
    drawer.close();
    navigate(draft);
  };

  const applyLabel = yearError
    ? "Revisa el intervalo"
    : isPreviewPending
      ? "Calculando…"
      : preview.key === draftKey && preview.status === "failed"
        ? "Aplicar filtros"
        : previewCount === null
          ? "Mostrar resultados"
          : `Mostrar ${previewCount.toLocaleString("es")} ${previewCount === 1 ? "obra" : "obras"}`;

  return (
    <div className="min-w-0" aria-busy={isNavigationPending}>
      <div className="mb-6 rounded-2xl border border-white/8 bg-[#08111E] px-3 py-3 shadow-[0_18px_45px_rgb(0_0_0/0.12)] sm:px-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onPress={() => {
              openFilters();
              drawer.open();
            }}
            className="min-h-11 rounded-xl bg-[#2F81F7] px-4 text-sm font-semibold text-white shadow-none transition-colors hover:bg-[#4A91F8]"
            isDisabled={isNavigationPending}
          >
            <SlidersHorizontal size={17} aria-hidden="true" />
            <span>Filtros</span>
            {appliedFilterCount > 0 && (
              <span className="grid min-w-5 place-items-center rounded-full bg-white/16 px-1.5 py-0.5 text-[11px] tabular-nums">
                {appliedFilterCount}
              </span>
            )}
          </Button>
          <Drawer state={drawer}>
            <Drawer.Trigger className="drawer-state-trigger" aria-hidden="true">
              Abrir filtros
            </Drawer.Trigger>
            <Drawer.Backdrop
              variant="transparent"
              className="mobile-drawer-backdrop z-[60] !bg-transparent"
            >
              <Drawer.Content
                placement="left"
                className="mobile-drawer-content z-[70]"
              >
                <Drawer.Dialog className="mobile-drawer-dialog !w-[min(100vw,27rem)] !max-w-[27rem] overflow-hidden border-r border-white/10 bg-[#07101A] !p-0 text-[#F3F8FC] shadow-[24px_0_70px_rgb(0_0_0/0.36)]">
                  <Drawer.Header className="mobile-drawer-header flex shrink-0 items-start justify-between border-b border-white/8 px-5 py-5 sm:px-6">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#5FA8FF]">
                        Catálogo
                      </span>
                      <Drawer.Heading className="mt-1 text-xl font-semibold tracking-[-.02em]">
                        Filtrar resultados
                      </Drawer.Heading>
                    </div>
                    <Drawer.CloseTrigger
                      className="grid size-11 shrink-0 place-items-center rounded-xl text-[#8FA3B4] outline-none transition-colors hover:bg-[#102130] hover:text-white focus-visible:ring-2 focus-visible:ring-[#5FA8FF]"
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
                      update={updateDraft}
                      setOne={setDraftValue}
                      setYearRange={setDraftYearRange}
                      yearError={yearError}
                    />
                  </Drawer.Body>
                  <Drawer.Footer className="mobile-drawer-footer sticky bottom-0 z-10 grid shrink-0 grid-cols-[minmax(0,.8fr)_minmax(0,1.35fr)] gap-3 border-t border-white/8 bg-[#07101A] px-5 py-4 sm:px-6">
                    {preview.key === draftKey &&
                      preview.status === "failed" &&
                      !draftMatchesApplied && (
                        <div
                          className="col-span-2 flex min-h-9 items-center justify-between gap-3 rounded-lg bg-[#271824] px-3 text-xs text-[#F5A3B2]"
                          role="alert"
                        >
                          <span>No se pudo calcular el total.</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="min-h-8 shrink-0 px-2 text-xs font-semibold text-[#FFB4C0]"
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
                      className="h-11 items-center justify-center rounded-xl border border-white/10 bg-[#0B1621] px-3 text-sm font-semibold leading-none text-[#DDE7EE] shadow-none"
                      onPress={() =>
                        setDraft((params) =>
                          clearCatalogFilters(params, bounds),
                        )
                      }
                      isDisabled={
                        countCatalogFilters(draft) === 0 || isNavigationPending
                      }
                    >
                      Limpiar filtros
                    </Button>
                    <Button
                      className="h-11 items-center justify-center rounded-xl bg-[#2F81F7] px-3 text-sm font-semibold leading-none text-white shadow-none"
                      onPress={applyFilters}
                      isDisabled={Boolean(yearError) || isNavigationPending}
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

          <p className="text-sm text-[#8FA3B4]" aria-live="polite">
            <strong className="font-semibold text-[#DDE7EE]">
              {totalRecords.toLocaleString("es")}
            </strong>{" "}
            {totalRecords === 1 ? "obra" : "obras"}
          </p>

          <Select
            aria-label="Ordenar catálogo"
            className="ml-auto w-56 max-sm:w-full"
            value={appliedParams.get("order") ?? ""}
            onChange={(key) => {
              const next = setCatalogParam(
                appliedParams,
                "order",
                String(key ?? ""),
                bounds,
              );
              navigate(next);
            }}
            variant="secondary"
            isDisabled={isNavigationPending}
          >
            <Select.Trigger className="h-11 items-center rounded-xl border border-white/8 bg-[#101A2A] text-sm text-[#F3F8FC] shadow-none">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="" textValue="Últimos agregados">
                  Últimos agregados
                </ListBox.Item>
                <ListBox.Item id="score" textValue="Mejor puntuación">
                  Mejor puntuación
                </ListBox.Item>
                <ListBox.Item id="popular" textValue="Más populares">
                  Más populares
                </ListBox.Item>
                <ListBox.Item id="title" textValue="Título A–Z">
                  Título A–Z
                </ListBox.Item>
                <ListBox.Item id="latest_released" textValue="Últimos emitidos">
                  Últimos emitidos
                </ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
        </div>

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
                    className="min-h-9 rounded-xl border border-white/8 bg-[#102130] px-3 text-xs font-medium text-[#DDE7EE]"
                  >
                    {entry.label}
                    <Tag.RemoveButton aria-label="Quitar">
                      <X size={13} aria-hidden="true" />
                    </Tag.RemoveButton>
                  </Tag>
                ))}
              </TagGroup.List>
            </TagGroup>
            <Button
              size="sm"
              variant="ghost"
              className="min-h-9 px-2 text-xs font-semibold text-[#66A3FF]"
              onPress={clearApplied}
              isDisabled={isNavigationPending}
            >
              Limpiar filtros
            </Button>
          </div>
        )}
      </div>

      <div
        className={`transition-opacity duration-150 ${isNavigationPending ? "pointer-events-none opacity-55" : "opacity-100"}`}
      >
        {children}
        {footer}
      </div>
      <span className="sr-only" aria-live="polite" role="status">
        {isNavigationPending
          ? "Actualizando resultados"
          : "Resultados actualizados"}
      </span>
    </div>
  );
}

function FilterPanel({
  params,
  categories,
  genres,
  bounds,
  genreQuery,
  setGenreQuery,
  update,
  setOne,
  setYearRange,
  yearError,
}: {
  params: URLSearchParams;
  categories: Category[];
  genres: Category[];
  bounds: YearBounds;
  genreQuery: string;
  setGenreQuery: (value: string) => void;
  update: (key: "category" | "genre", values: string[]) => void;
  setOne: (key: "status", value: string) => void;
  setYearRange: (value: [number, number]) => void;
  yearError: string | null;
}) {
  const normalizedGenreQuery = normalizeForSearch(genreQuery);
  const filteredGenres = genres.filter((genre) =>
    normalizeForSearch(genre.name).includes(normalizedGenreQuery),
  );
  const rawMinYear = params.has("minYear")
    ? Number(params.get("minYear"))
    : bounds.min;
  const rawMaxYear = params.has("maxYear")
    ? Number(params.get("maxYear"))
    : bounds.max;
  const yearRange: [number, number] = [
    Math.min(rawMinYear, rawMaxYear),
    Math.max(rawMinYear, rawMaxYear),
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
          onChange={(values) => update("category", values)}
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
          {statusOptions.map(([value, label]) => (
            <Radio
              key={value || "any"}
              value={value}
              className="group/radio !mt-0 min-h-11 w-full justify-center rounded-lg px-2.5 transition-colors hover:bg-white/[.035] data-[selected]:bg-[#10213A]"
            >
              <Radio.Content className="flex h-11 w-full items-center gap-2.5 text-left text-sm leading-5 text-[#C4D2DE] data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-[#5FA8FF] data-[focus-visible=true]:ring-offset-1 data-[focus-visible=true]:ring-offset-[#07101A]">
                <Radio.Control className="shrink-0">
                  <Radio.Indicator />
                </Radio.Control>
                <Label className="min-w-0 flex-1">{label}</Label>
              </Radio.Content>
            </Radio>
          ))}
        </RadioGroup>
      </FilterDisclosure>

      <FilterDisclosure
        title="Año"
        count={Number(params.has("minYear") || params.has("maxYear"))}
      >
        <div className="rounded-xl bg-[#0B1621] px-3.5 py-3">
          <Slider
            value={yearRange}
            minValue={bounds.min}
            maxValue={bounds.max}
            step={1}
            onChange={(value) => {
              if (!Array.isArray(value) || value.length !== 2) return;
              setYearRange([value[0], value[1]]);
            }}
            className="gap-y-3"
          >
            <Label className="text-xs font-medium text-[#8FA3B4]">
              Rango de años
            </Label>
            <Slider.Output className="text-sm font-semibold tabular-nums text-[#F3F8FC]">
              {`${yearRange[0]} – ${yearRange[1]}`}
            </Slider.Output>
            <Slider.Track className="!h-6 !rounded-full !border-x-[10px] !border-x-transparent !bg-[#101A2A]">
              <Slider.Fill className="rounded-full bg-[#2F81F7]" />
              <Slider.Thumb
                index={0}
                aria-label="Año inicial"
                className="!size-7 !w-7 !rounded-full !bg-transparent after:!size-4 after:!rounded-full after:!bg-[#F3F8FC]"
              />
              <Slider.Thumb
                index={1}
                aria-label="Año final"
                className="!size-7 !w-7 !rounded-full !bg-transparent after:!size-4 after:!rounded-full after:!bg-[#F3F8FC]"
              />
            </Slider.Track>
          </Slider>
          <div
            aria-hidden="true"
            className="mt-1 flex justify-between px-0.5 text-[10px] tabular-nums text-[#5F7487]"
          >
            <span>{bounds.min}</span>
            <span>{bounds.max}</span>
          </div>
        </div>
        {yearError && (
          <p className="mt-2 text-xs font-medium text-[#FB7185]" role="alert">
            {yearError}
          </p>
        )}
        {(params.has("minYear") || params.has("maxYear")) && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 h-9 items-center justify-start px-1 text-xs font-semibold leading-none text-[#66A3FF]"
            onPress={() => setYearRange([bounds.min, bounds.max])}
          >
            Cualquier año
          </Button>
        )}
      </FilterDisclosure>

      <FilterDisclosure title="Géneros" count={params.getAll("genre").length}>
        <SearchField
          aria-label="Buscar género"
          value={genreQuery}
          onChange={setGenreQuery}
          className="w-full"
          variant="secondary"
        >
          <SearchField.Group className="h-11 rounded-xl border border-white/8 bg-[#101A2A] shadow-none">
            <SearchField.SearchIcon>
              <Search size={16} aria-hidden="true" />
            </SearchField.SearchIcon>
            <SearchField.Input placeholder="Buscar género" />
            <SearchField.ClearButton aria-label="Borrar búsqueda de género" />
          </SearchField.Group>
        </SearchField>
        <CheckboxGroup
          value={params.getAll("genre")}
          onChange={(values) => update("genre", values)}
          variant="secondary"
          className="mt-3 !grid grid-cols-2 !gap-1 max-[360px]:grid-cols-1 [&_[data-slot=checkbox]]:!mt-0"
        >
          <Label className="sr-only">Géneros</Label>
          {filteredGenres.map((item) => (
            <FilterCheckbox key={item.id} label={item.name} value={item.slug} />
          ))}
        </CheckboxGroup>
        {filteredGenres.length === 0 && (
          <div className="py-8 text-center">
            <ListFilter
              size={20}
              className="mx-auto text-[#5F7487]"
              aria-hidden="true"
            />
            <p className="mt-2 text-sm text-[#8FA3B4]">
              No hay géneros que coincidan.
            </p>
          </div>
        )}
      </FilterDisclosure>
    </div>
  );
}

function FilterCheckbox({ label, value }: { label: string; value: string }) {
  return (
    <Checkbox
      value={value}
      className="group/filter !mt-0 min-h-11 w-full justify-center rounded-lg px-2.5 transition-colors hover:bg-white/[.035] data-[selected=true]:bg-[#10213A]"
    >
      <Checkbox.Content className="flex h-11 w-full min-w-0 items-center gap-2.5 text-left text-sm leading-5 text-[#C4D2DE] data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-[#5FA8FF] data-[focus-visible=true]:ring-offset-1 data-[focus-visible=true]:ring-offset-[#07101A]">
        <Checkbox.Control className="shrink-0">
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Label className="min-w-0 flex-1 truncate">{label}</Label>
      </Checkbox.Content>
    </Checkbox>
  );
}

function FilterDisclosure({
  title,
  count = 0,
  className = "",
  children,
}: {
  title: string;
  count?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Disclosure defaultExpanded className={`py-5 ${className}`}>
      <Disclosure.Heading>
        <Disclosure.Trigger className="flex min-h-10 w-full items-center gap-2 rounded-lg text-sm font-semibold text-[#F3F8FC] outline-none focus-visible:ring-2 focus-visible:ring-[#5FA8FF]">
          <span>{title}</span>
          {count > 0 && (
            <span className="rounded-full bg-[#16243A] px-2 py-0.5 text-[10px] tabular-nums text-[#7DB6FF]">
              {count}
            </span>
          )}
          <Disclosure.Indicator className="ml-auto size-4 text-[#8FA3B4]">
            <ChevronDown size={16} aria-hidden="true" />
          </Disclosure.Indicator>
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="pt-3">{children}</Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}

function getSelectedFilters(
  params: URLSearchParams,
  categories: Category[],
  genres: Category[],
  bounds: YearBounds,
): SelectedFilter[] {
  const entries: SelectedFilter[] = [];
  for (const key of ["category", "genre"] as const) {
    for (const value of params.getAll(key)) {
      const item = (key === "category" ? categories : genres).find(
        (entry) => entry.slug === value,
      );
      if (item) {
        entries.push({
          id: `${key}:${value}`,
          key,
          value,
          label: item.name,
        });
      }
    }
  }

  const status = statusOptions.find(
    ([value]) => value === params.get("status"),
  );
  if (status?.[0]) {
    entries.push({
      id: `status:${status[0]}`,
      key: "status",
      value: status[0],
      label: status[1],
    });
  }
  if (params.has("minYear") || params.has("maxYear")) {
    entries.push({
      id: "years:",
      key: "years",
      value: "",
      label: `${params.get("minYear") ?? bounds.min}–${params.get("maxYear") ?? bounds.max}`,
    });
  }
  const letter = params.get("letter");
  if (letter) {
    entries.push({
      id: `letter:${letter}`,
      key: "letter",
      value: letter,
      label: `Inicial ${letter.toLocaleUpperCase("es")}`,
    });
  }
  return entries;
}
