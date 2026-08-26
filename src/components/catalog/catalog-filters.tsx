"use client";

import {
  Button,
  Checkbox,
  Disclosure,
  Drawer,
  Label,
  ListBox,
  NumberField,
  Radio,
  RadioGroup,
  SearchField,
  Select,
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
  setCatalogParam,
  setCatalogYear,
  toCatalogApiParams,
  toggleCatalogParam,
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
  const currentKey = current.toString();
  const appliedParams = useMemo(
    () => normalizeCatalogParams(new URLSearchParams(currentKey), bounds),
    [bounds, currentKey],
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
        .then(({ totalRecords: nextTotalRecords }) =>
          setPreview({
            key: draftKey,
            count: nextTotalRecords,
            status: "ready",
          }),
        )
        .catch(() =>
          setPreview((currentPreview) =>
            currentPreview.key === draftKey
              ? { key: draftKey, count: null, status: "failed" }
              : currentPreview,
          ),
        );
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [draft, draftKey, draftMatchesApplied, drawer.isOpen, yearError]);

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

  const updateDraft = (key: "category" | "genre", value: string) =>
    setDraft((params) => toggleCatalogParam(params, key, value, bounds));

  const setDraftValue = (
    key: "status" | "minYear" | "maxYear",
    value: string,
  ) => setDraft((params) => setCatalogParam(params, key, value, bounds));

  const setDraftYear = (key: "minYear" | "maxYear", value: number) =>
    setDraft((params) => setCatalogYear(params, key, value, bounds));

  const applyFilters = () => {
    if (yearError || isNavigationPending) return;
    drawer.close();
    navigate(draft);
  };

  const applyLabel = yearError
    ? "Revisa el intervalo"
    : isPreviewPending
      ? "Calculando…"
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
                      setYear={setDraftYear}
                      yearError={yearError}
                    />
                  </Drawer.Body>
                  <Drawer.Footer className="mobile-drawer-footer sticky bottom-0 z-10 grid shrink-0 grid-cols-[minmax(0,.8fr)_minmax(0,1.35fr)] gap-3 border-t border-white/8 bg-[#07101A] px-5 py-4 sm:px-6">
                    <Button
                      variant="secondary"
                      className="min-h-11 rounded-xl border border-white/10 bg-[#0B1621] px-3 text-sm font-semibold text-[#DDE7EE] shadow-none"
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
                      className="min-h-11 rounded-xl bg-[#2F81F7] px-3 text-sm font-semibold text-white shadow-none"
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
            <Label className="sr-only">Ordenar</Label>
            <Select.Trigger className="h-11 rounded-xl border border-white/8 bg-[#101A2A] text-sm text-[#F3F8FC] shadow-none">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="" textValue="Orden de la fuente">
                  Orden de la fuente
                </ListBox.Item>
                <ListBox.Item id="title-asc" textValue="Título A–Z">
                  Título A–Z
                </ListBox.Item>
                <ListBox.Item id="title-desc" textValue="Título Z–A">
                  Título Z–A
                </ListBox.Item>
                <ListBox.Item id="score-desc" textValue="Mejor puntuación">
                  Mejor puntuación
                </ListBox.Item>
                <ListBox.Item id="date-desc" textValue="Más recientes">
                  Más recientes
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
                    <Tag.RemoveButton aria-label={`Quitar ${entry.label}`}>
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
  setYear,
  yearError,
}: {
  params: URLSearchParams;
  categories: Category[];
  genres: Category[];
  bounds: YearBounds;
  genreQuery: string;
  setGenreQuery: (value: string) => void;
  update: (key: "category" | "genre", value: string) => void;
  setOne: (key: "status" | "minYear" | "maxYear", value: string) => void;
  setYear: (key: "minYear" | "maxYear", value: number) => void;
  yearError: string | null;
}) {
  const normalizedGenreQuery = normalizeForSearch(genreQuery);
  const filteredGenres = genres.filter((genre) =>
    normalizeForSearch(genre.name).includes(normalizedGenreQuery),
  );
  const minYear = params.has("minYear")
    ? Number(params.get("minYear"))
    : undefined;
  const maxYear = params.has("maxYear")
    ? Number(params.get("maxYear"))
    : undefined;

  return (
    <div className="divide-y divide-white/8">
      <FilterDisclosure
        title="Formato"
        count={params.getAll("category").length}
        className="first:pt-5"
      >
        <div className="grid grid-cols-2 gap-2 max-[360px]:grid-cols-1">
          {categories.map((item) => (
            <FilterCheckbox
              key={item.id}
              label={item.name}
              isSelected={params.getAll("category").includes(item.slug)}
              onChange={() => update("category", item.slug)}
            />
          ))}
        </div>
      </FilterDisclosure>

      <FilterDisclosure title="Estado" count={params.has("status") ? 1 : 0}>
        <RadioGroup
          aria-label="Estado"
          value={params.get("status") ?? ""}
          onChange={(value) => setOne("status", value)}
          className="grid grid-cols-2 gap-2 max-[360px]:grid-cols-1"
        >
          {statusOptions.map(([value, label]) => (
            <Radio
              key={value || "any"}
              value={value}
              className="min-h-11 rounded-xl border border-white/10 px-3 text-sm text-[#C4D2DE] transition-colors selected:border-[#2F81F7] selected:bg-[#10213A]"
            >
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              <Radio.Content>{label}</Radio.Content>
            </Radio>
          ))}
        </RadioGroup>
      </FilterDisclosure>

      <FilterDisclosure
        title="Año"
        count={Number(params.has("minYear") || params.has("maxYear"))}
      >
        <div className="grid grid-cols-2 gap-3">
          <YearField
            label="Desde"
            value={minYear}
            placeholder={String(bounds.min)}
            bounds={bounds}
            isInvalid={Boolean(yearError)}
            onChange={(value) => setYear("minYear", value)}
          />
          <YearField
            label="Hasta"
            value={maxYear}
            placeholder={String(bounds.max)}
            bounds={bounds}
            isInvalid={Boolean(yearError)}
            onChange={(value) => setYear("maxYear", value)}
          />
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
            className="mt-2 min-h-9 justify-start px-0 text-xs font-semibold text-[#66A3FF]"
            onPress={() => {
              setOne("minYear", "");
              setOne("maxYear", "");
            }}
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
        <div className="mt-3 grid grid-cols-2 gap-2 max-[360px]:grid-cols-1">
          {filteredGenres.map((item) => (
            <FilterCheckbox
              key={item.id}
              label={item.name}
              isSelected={params.getAll("genre").includes(item.slug)}
              onChange={() => update("genre", item.slug)}
            />
          ))}
        </div>
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

function FilterCheckbox({
  label,
  isSelected,
  onChange,
}: {
  label: string;
  isSelected: boolean;
  onChange: () => void;
}) {
  return (
    <Checkbox
      isSelected={isSelected}
      onChange={onChange}
      className="min-h-11 rounded-xl border border-white/10 px-3 text-sm text-[#C4D2DE] transition-colors selected:border-[#2F81F7] selected:bg-[#10213A]"
    >
      <Checkbox.Content className="w-full min-w-0">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <Checkbox.Control className="order-last ml-auto shrink-0">
          <Checkbox.Indicator />
        </Checkbox.Control>
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

function YearField({
  label,
  value,
  placeholder,
  bounds,
  isInvalid,
  onChange,
}: {
  label: string;
  value: number | undefined;
  placeholder: string;
  bounds: YearBounds;
  isInvalid: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <NumberField
      aria-label={`Año ${label.toLocaleLowerCase("es")}`}
      value={value ?? Number.NaN}
      minValue={bounds.min}
      maxValue={bounds.max}
      onChange={onChange}
      formatOptions={{ useGrouping: false }}
      isInvalid={isInvalid}
      className="min-w-0"
    >
      <Label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-[#8FA3B4]">
        {label}
      </Label>
      <NumberField.Group className="h-11 rounded-xl border border-white/10 bg-[#101A2A] shadow-none invalid:border-[#FB7185]">
        <NumberField.Input
          placeholder={placeholder}
          className="col-[1/-1] w-full min-w-0 px-3 text-left text-sm tabular-nums text-[#F3F8FC] placeholder:text-[#5F7487]"
        />
      </NumberField.Group>
    </NumberField>
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
