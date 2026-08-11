"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { components } from "@/lib/api/generated";

type Category = components["schemas"]["CategoryDto"];

export function CatalogFilters({
  categories,
  genres,
  years,
}: {
  categories: Category[];
  genres: Category[];
  years: number[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const current = useSearchParams();
  const [open, setOpen] = useState(false);
  const [params, setParams] = useState(
    () => new URLSearchParams(current.toString()),
  );
  const toggle = (key: string, value: string) => {
    const values = params.getAll(key);
    if (values.includes(value)) {
      const next = new URLSearchParams(params);
      next.delete(key);
      values
        .filter((entry) => entry !== value)
        .forEach((entry) => next.append(key, entry));
      setParams(next);
    } else {
      const next = new URLSearchParams(params);
      next.append(key, value);
      setParams(next);
    }
  };
  const selected = [...params.getAll("genre"), ...params.getAll("category")]
    .length;
  return (
    <div className="filter-bar">
      <button className="filter-trigger" onClick={() => setOpen(true)}>
        <SlidersHorizontal size={16} /> Filtros
        {selected ? ` · ${selected}` : ""}
      </button>
      <select
        value={params.get("order") ?? ""}
        onChange={(event) => {
          const next = new URLSearchParams(current);
          if (event.target.value) next.set("order", event.target.value);
          else next.delete("order");
          next.delete("page");
          router.push(`${pathname}?${next}`);
        }}
        aria-label="Ordenar catálogo"
      >
        <option value="">Orden de la fuente</option>
        <option value="title-asc">Título A–Z</option>
        <option value="title-desc">Título Z–A</option>
        <option value="score-desc">Mejor puntuación</option>
        <option value="date-desc">Más recientes</option>
      </select>
      {open && (
        <div
          className="filter-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Filtros de catálogo"
        >
          <div className="filter-panel">
            <div className="dialog-topline">
              <h2>Filtrar catálogo</h2>
              <button
                className="icon-button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="filter-content">
              <fieldset>
                <legend>Formato</legend>
                <div className="filter-options">
                  {categories.map((item) => (
                    <label key={item.id}>
                      <input
                        type="checkbox"
                        checked={params.getAll("category").includes(item.slug)}
                        onChange={() => toggle("category", item.slug)}
                      />
                      {item.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Género</legend>
                <div className="filter-options genre-options">
                  {genres.map((item) => (
                    <label key={item.id}>
                      <input
                        type="checkbox"
                        checked={params.getAll("genre").includes(item.slug)}
                        onChange={() => toggle("genre", item.slug)}
                      />
                      {item.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Estado</legend>
                <div className="choice-row">
                  {[
                    ["", "Todos"],
                    ["emision", "En emisión"],
                    ["finalizado", "Finalizados"],
                    ["proximamente", "Próximamente"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={
                        (params.get("status") ?? "") === value
                          ? "choice active"
                          : "choice"
                      }
                      onClick={() => {
                        const next = new URLSearchParams(params);
                        if (value) next.set("status", value);
                        else next.delete("status");
                        setParams(next);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Años</legend>
                <div className="year-row">
                  <input
                    type="number"
                    min={years[0]}
                    max={years[1]}
                    value={params.get("minYear") ?? years[0]}
                    onChange={(event) => {
                      const next = new URLSearchParams(params);
                      next.set("minYear", event.target.value);
                      setParams(next);
                    }}
                  />
                  <span>—</span>
                  <input
                    type="number"
                    min={years[0]}
                    max={years[1]}
                    value={params.get("maxYear") ?? years[1]}
                    onChange={(event) => {
                      const next = new URLSearchParams(params);
                      next.set("maxYear", event.target.value);
                      setParams(next);
                    }}
                  />
                </div>
              </fieldset>
              <div className="filter-actions">
                <button
                  className="secondary-button"
                  onClick={() => setParams(new URLSearchParams())}
                >
                  Limpiar
                </button>
                <button
                  className="primary-button"
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.delete("page");
                    router.push(`${pathname}?${next}`);
                    setOpen(false);
                  }}
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
