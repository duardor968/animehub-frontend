"use client";

import { useQuery } from "@tanstack/react-query";
import { SearchField } from "@heroui/react";
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
    <div
      ref={root}
      className={
        compact
          ? "relative min-w-0 max-w-xl flex-1 max-[800px]:hidden"
          : "relative w-full max-w-2xl"
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (query.trim())
            router.push(`/buscar?q=${encodeURIComponent(query.trim())}`);
          setOpen(false);
        }}
      >
        <SearchField
          fullWidth
          name="search"
          variant="secondary"
          value={query}
          onChange={(value) => {
            setQuery(value);
            setOpen(true);
          }}
          aria-label="Buscar anime"
        >
          <SearchField.Group className="h-11 rounded-xl border border-white/8 bg-[#0B1621] shadow-none transition-[background-color,box-shadow] duration-200 focus-within:bg-[#0E1B2B] focus-within:shadow-[0_0_0_2px_rgba(91,156,255,.55)]">
            <SearchField.SearchIcon className="text-[#7F93A8]" />
            <SearchField.Input
              className="text-sm text-[#F3F8FC] placeholder:text-[#718596]"
              onFocus={() => setOpen(true)}
              placeholder="Buscar anime"
            />
            <SearchField.ClearButton
              className="mr-1 text-[#8FA3B4] hover:text-[#F3F8FC]"
              aria-label="Limpiar búsqueda"
            />
          </SearchField.Group>
        </SearchField>
      </form>
      {open && debounced.length >= 2 && (
        <div
          className="absolute inset-x-0 top-[calc(100%+.5rem)] z-50 overflow-hidden rounded-xl border border-white/10 bg-[#0B1621] p-1.5 shadow-[0_22px_70px_rgba(0,0,0,.5)]"
          aria-live="polite"
        >
          {suggestions.data?.data.map((anime) => (
            <Link
              key={anime.id}
              href={`/anime/${anime.slug}`}
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center justify-between gap-4 rounded-lg px-3 py-2 text-sm text-[#F3F8FC] transition-colors hover:bg-[#102130] focus-visible:bg-[#102130] focus-visible:outline-none"
            >
              <span>{anime.title}</span>
              <small className="shrink-0 text-xs text-[#8FA3B4]">
                {anime.category?.name ?? "Anime"}
              </small>
            </Link>
          ))}
          {!suggestions.isLoading && suggestions.data?.data.length === 0 && (
            <p className="px-3 py-4 text-sm text-[#8FA3B4]">
              Sin coincidencias.
            </p>
          )}
          <Link
            className="mt-1 flex min-h-10 items-center rounded-lg border-t border-white/8 px-3 pt-2 text-sm font-semibold text-[#2F81F7] hover:bg-[#102130] focus-visible:outline-none"
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
