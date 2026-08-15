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
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import type { components } from "@/lib/api/generated";

type Category = components["schemas"]["CategoryDto"];

const statusOptions = [
  ["emision", "En emisión"],
  ["finalizado", "Finalizado"],
  ["proximamente", "Próximamente"],
] as const;

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
  const [expanded, setExpanded] = useState(true);
  const [draft, setDraft] = useState(
    () => new URLSearchParams(current.toString()),
  );
  const [genreQuery, setGenreQuery] = useState("");

  const navigate = (params: URLSearchParams) => {
    params.delete("page");
    router.push(`${pathname}${params.size ? `?${params}` : ""}`);
  };
  const update = (key: string, value: string, immediate: boolean) => {
    const next = new URLSearchParams(
      immediate ? current.toString() : draft.toString(),
    );
    if (next.getAll(key).includes(value)) {
      const remaining = next.getAll(key).filter((entry) => entry !== value);
      next.delete(key);
      remaining.forEach((entry) => next.append(key, entry));
    } else next.append(key, value);
    if (immediate) navigate(next);
    else setDraft(next);
  };
  const setOne = (key: string, value: string, immediate: boolean) => {
    const next = new URLSearchParams(
      immediate ? current.toString() : draft.toString(),
    );
    if (value) next.set(key, value);
    else next.delete(key);
    if (immediate) navigate(next);
    else setDraft(next);
  };
  const filteredGenres = genres.filter((genre) =>
    genre.name
      .toLocaleLowerCase("es")
      .includes(genreQuery.toLocaleLowerCase("es")),
  );
  const selected = useMemo(() => {
    const entries: Array<{
      id: string;
      key: string;
      value: string;
      label: string;
    }> = [];
    for (const key of ["category", "genre"] as const) {
      for (const value of current.getAll(key)) {
        const item = (key === "category" ? categories : genres).find(
          (entry) => entry.slug === value,
        );
        if (item)
          entries.push({
            id: `${key}:${value}`,
            key,
            value,
            label: item.name,
          });
      }
    }
    const status = statusOptions.find(
      ([value]) => value === current.get("status"),
    );
    if (status)
      entries.push({
        id: `status:${status[0]}`,
        key: "status",
        value: status[0],
        label: status[1],
      });
    if (current.has("minYear") || current.has("maxYear"))
      entries.push({
        id: "years:",
        key: "years",
        value: "",
        label: `${current.get("minYear") ?? years[0]}–${current.get("maxYear") ?? years[1]}`,
      });
    return entries;
  }, [categories, current, genres, years]);

  const removeSelected = (keys: Set<React.Key>) => {
    const next = new URLSearchParams(current.toString());
    for (const id of keys) {
      const entry = selected.find((item) => item.id === String(id));
      if (!entry) continue;
      if (entry.key === "years") {
        next.delete("minYear");
        next.delete("maxYear");
      } else if (entry.key === "status") {
        next.delete("status");
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

  const panel = (mobile: boolean) => (
    <FilterPanel
      params={mobile ? draft : new URLSearchParams(current.toString())}
      categories={categories}
      genres={filteredGenres}
      years={years}
      genreQuery={genreQuery}
      setGenreQuery={setGenreQuery}
      update={(key, value) => update(key, value, !mobile)}
      setOne={(key, value) => setOne(key, value, !mobile)}
    />
  );

  return (
    <>
      <div
        className={`grid items-start gap-8 ${expanded ? "lg:grid-cols-[240px_minmax(0,1fr)]" : "grid-cols-1"}`}
      >
        <aside
          className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2 max-lg:hidden"
          aria-label="Filtros del catálogo"
          hidden={!expanded}
        >
          <div className="mb-4 flex items-center justify-between border-b border-white/8 pb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#2F81F7]">
                Refinar
              </span>
              <h2 className="mt-1 text-lg font-semibold text-[#F3F8FC]">
                Filtros
              </h2>
            </div>
            <Button
              isIconOnly
              variant="ghost"
              className="h-10 w-10 rounded-lg text-[#8FA3B4] shadow-none"
              aria-label="Ocultar filtros"
              onPress={() => setExpanded(false)}
            >
              <ChevronLeft size={17} />
            </Button>
          </div>
          {panel(false)}
        </aside>
        <div className="min-w-0">
          <div className="mb-5 flex min-h-11 flex-wrap items-center gap-3 border-b border-white/8 pb-3">
            <Button
              variant="secondary"
              className="hidden h-10 rounded-lg border border-white/10 bg-[#0B1621] text-[#F3F8FC] shadow-none max-lg:flex"
              onPress={() => {
                setDraft(new URLSearchParams(current.toString()));
                drawer.open();
              }}
            >
              <SlidersHorizontal size={17} /> Filtros{" "}
              {selected.length ? <b>{selected.length}</b> : null}
            </Button>
            {!expanded && (
              <Button
                variant="secondary"
                className="h-10 rounded-lg border border-white/10 bg-[#0B1621] text-[#F3F8FC] shadow-none max-lg:hidden"
                onPress={() => setExpanded(true)}
              >
                <ChevronRight size={17} /> Mostrar filtros
              </Button>
            )}
            <span className="text-sm text-[#8FA3B4]">
              <strong>{totalRecords.toLocaleString("es")}</strong> obras
            </span>
            <Select
              aria-label="Ordenar catálogo"
              className="ml-auto w-56 max-sm:w-full"
              value={current.get("order") ?? ""}
              onChange={(key) => setOne("order", String(key ?? ""), true)}
              variant="secondary"
            >
              <Label className="sr-only">Ordenar</Label>
              <Select.Trigger className="h-10 rounded-xl bg-[#101A2A] text-sm text-[#F3F8FC] shadow-none">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="">Orden de la fuente</ListBox.Item>
                  <ListBox.Item id="title-asc">Título A–Z</ListBox.Item>
                  <ListBox.Item id="title-desc">Título Z–A</ListBox.Item>
                  <ListBox.Item id="score-desc">Mejor puntuación</ListBox.Item>
                  <ListBox.Item id="date-desc">Más recientes</ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
          </div>
          {selected.length > 0 && (
            <TagGroup
              className="mb-5"
              aria-label="Filtros aplicados"
              onRemove={removeSelected}
            >
              <TagGroup.List className="flex flex-wrap gap-2">
                {selected.map((entry) => (
                  <Tag
                    id={entry.id}
                    key={entry.id}
                    variant="surface"
                    className="min-h-9 rounded-xl bg-[#102130] px-3 text-xs font-medium text-[#DDE7EE]"
                  >
                    {entry.label}
                    <Tag.RemoveButton aria-label={`Quitar ${entry.label}`}>
                      <X size={13} />
                    </Tag.RemoveButton>
                  </Tag>
                ))}
              </TagGroup.List>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 min-h-9 text-xs font-semibold text-[#5FA8FF]"
                onPress={() => {
                  const next = new URLSearchParams();
                  const q = current.get("q");
                  if (q) next.set("q", q);
                  navigate(next);
                }}
              >
                Limpiar todo
              </Button>
            </TagGroup>
          )}
          {children}
          {footer}
        </div>
      </div>
      <Drawer state={drawer}>
        <Drawer.Trigger className="drawer-state-trigger" aria-hidden="true">
          Abrir filtros
        </Drawer.Trigger>
        <Drawer.Backdrop variant="blur" className="z-[60]">
          <Drawer.Content placement="right" className="z-[70]">
            <Drawer.Dialog
              aria-label="Filtros del catálogo"
              className="!w-full !max-w-md border-l border-white/10 bg-[#07101A] text-[#F3F8FC]"
            >
              <Drawer.Header className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#2F81F7]">
                    Catálogo
                  </span>
                  <h2>Filtrar resultados</h2>
                </div>
                <Drawer.CloseTrigger
                  className="grid size-10 place-items-center rounded-lg text-[#8FA3B4] hover:bg-[#102130]"
                  aria-label="Cerrar"
                >
                  <X size={18} />
                </Drawer.CloseTrigger>
              </Drawer.Header>
              <Drawer.Body className="px-5 py-4">{panel(true)}</Drawer.Body>
              <Drawer.Footer className="border-t border-white/8 px-5 py-4">
                <Button
                  variant="secondary"
                  className="rounded-lg border border-white/10 bg-[#0B1621] text-[#F3F8FC] shadow-none"
                  onPress={() => setDraft(new URLSearchParams())}
                >
                  Limpiar
                </Button>
                <Button
                  className="rounded-lg bg-[#2F81F7] font-semibold text-[#FFFFFF] shadow-none"
                  onPress={() => {
                    navigate(new URLSearchParams(draft));
                    drawer.close();
                  }}
                >
                  Aplicar filtros
                </Button>
              </Drawer.Footer>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
    </>
  );
}

function FilterPanel({
  params,
  categories,
  genres,
  years,
  genreQuery,
  setGenreQuery,
  update,
  setOne,
}: {
  params: URLSearchParams;
  categories: Category[];
  genres: Category[];
  years: number[];
  genreQuery: string;
  setGenreQuery: (value: string) => void;
  update: (key: string, value: string) => void;
  setOne: (key: string, value: string) => void;
}) {
  return (
    <div className="divide-y divide-white/8">
      <FilterDisclosure
        title="Formato"
        count={params.getAll("category").length}
        className="first:pt-0"
      >
        <div className="flex flex-col gap-2.5">
          {categories.map((item) => (
            <Checkbox
              key={item.id}
              isSelected={params.getAll("category").includes(item.slug)}
              onChange={() => update("category", item.slug)}
              className="min-h-8 text-sm text-[#C4D2DE]"
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                {item.name}
              </Checkbox.Content>
            </Checkbox>
          ))}
        </div>
      </FilterDisclosure>
      <FilterDisclosure title="Estado" count={params.has("status") ? 1 : 0}>
        <RadioGroup
          aria-label="Estado"
          value={params.get("status") ?? ""}
          onChange={(value) => setOne("status", value)}
          className="gap-2.5"
        >
          {statusOptions.map(([value, label]) => (
            <Radio
              key={value}
              value={value}
              className="min-h-8 text-sm text-[#C4D2DE]"
            >
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              <Radio.Content>{label}</Radio.Content>
            </Radio>
          ))}
        </RadioGroup>
        {params.has("status") && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 justify-start px-0 text-xs font-semibold text-[#5FA8FF]"
            onPress={() => setOne("status", "")}
          >
            Cualquier estado
          </Button>
        )}
      </FilterDisclosure>
      <FilterDisclosure title="Año">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
          <YearField
            label="Desde"
            value={Number(params.get("minYear") ?? years[0])}
            minValue={years[0]}
            maxValue={years[1]}
            onChange={(value) => setOne("minYear", String(value))}
          />
          <span>—</span>
          <YearField
            label="Hasta"
            value={Number(params.get("maxYear") ?? years[1])}
            minValue={years[0]}
            maxValue={years[1]}
            onChange={(value) => setOne("maxYear", String(value))}
          />
        </div>
      </FilterDisclosure>
      <FilterDisclosure title="Géneros" count={params.getAll("genre").length}>
        <SearchField
          aria-label="Buscar género"
          value={genreQuery}
          onChange={setGenreQuery}
          className="w-full"
          variant="secondary"
        >
          <SearchField.Group className="h-10 rounded-xl bg-[#101A2A] shadow-none">
            <SearchField.SearchIcon>
              <Search size={15} />
            </SearchField.SearchIcon>
            <SearchField.Input placeholder="Buscar género" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <div className="mt-3 flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
          {genres.map((item) => (
            <Checkbox
              key={item.id}
              isSelected={params.getAll("genre").includes(item.slug)}
              onChange={() => update("genre", item.slug)}
              className="min-h-8 text-sm text-[#C4D2DE]"
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                {item.name}
              </Checkbox.Content>
            </Checkbox>
          ))}
        </div>
      </FilterDisclosure>
    </div>
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
    <Disclosure defaultExpanded className={`py-4 ${className}`}>
      <Disclosure.Heading>
        <Disclosure.Trigger className="flex w-full items-center gap-2 text-sm font-semibold text-[#F3F8FC]">
          <span>{title}</span>
          {count > 0 && (
            <span className="rounded-full bg-[#16243A] px-2 py-0.5 text-[10px] tabular-nums text-[#7DB6FF]">
              {count}
            </span>
          )}
          <Disclosure.Indicator className="ml-auto size-4 text-[#8FA3B4]">
            <ChevronDown size={16} />
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
  minValue,
  maxValue,
  onChange,
}: {
  label: string;
  value: number;
  minValue: number;
  maxValue: number;
  onChange: (value: number) => void;
}) {
  return (
    <NumberField
      aria-label={`Año ${label.toLocaleLowerCase("es")}`}
      value={value}
      minValue={minValue}
      maxValue={maxValue}
      onChange={onChange}
      formatOptions={{ useGrouping: false }}
      className="min-w-0"
    >
      <Label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-[#8FA3B4]">
        {label}
      </Label>
      <NumberField.Group className="h-10 rounded-xl bg-[#101A2A] shadow-none">
        <NumberField.DecrementButton
          aria-label={`Reducir año ${label.toLocaleLowerCase("es")}`}
        >
          <Minus size={12} />
        </NumberField.DecrementButton>
        <NumberField.Input className="min-w-0 text-center text-xs tabular-nums text-[#F3F8FC]" />
        <NumberField.IncrementButton
          aria-label={`Aumentar año ${label.toLocaleLowerCase("es")}`}
        >
          <Plus size={12} />
        </NumberField.IncrementButton>
      </NumberField.Group>
    </NumberField>
  );
}
