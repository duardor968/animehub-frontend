"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiFetch, type AnimeSummary } from "@/lib/api/client";

function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);
  return debounced;
}

export function SearchBox({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(query.trim(), 250);
  const suggestions = useQuery({
    queryKey: ["suggestions", debounced],
    enabled: debounced.length >= 2,
    queryFn: ({ signal }) =>
      apiFetch<{ data: AnimeSummary[] }>(
        `/catalog/suggestions?q=${encodeURIComponent(debounced)}`,
        { signal },
        true,
      ),
  });
  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  return (
    <div ref={root} className={compact ? "search-box compact" : "search-box"}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (query.trim())
            router.push(`/buscar?q=${encodeURIComponent(query.trim())}`);
          setOpen(false);
        }}
      >
        <Search aria-hidden="true" size={17} />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar anime"
          aria-label="Buscar anime"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Limpiar búsqueda"
          >
            <X size={15} />
          </button>
        )}
      </form>
      {open && debounced.length >= 2 && (
        <div className="suggestions" aria-live="polite">
          {suggestions.data?.data.map((anime) => (
            <Link
              key={anime.id}
              href={`/anime/${anime.slug}`}
              onClick={() => setOpen(false)}
            >
              <span>{anime.title}</span>
              <small>{anime.category?.name ?? "Anime"}</small>
            </Link>
          ))}
          {!suggestions.isLoading && suggestions.data?.data.length === 0 && (
            <p>Sin coincidencias.</p>
          )}
          <Link
            className="all-results"
            href={`/buscar?q=${encodeURIComponent(debounced)}`}
            onClick={() => setOpen(false)}
          >
            Ver todos los resultados
          </Link>
        </div>
      )}
    </div>
  );
}
