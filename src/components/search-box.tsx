"use client";

import { Button, SearchField } from "@heroui/react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiFetch, type AnimeSummary } from "@/lib/api/client";
import { AnimeImage } from "./anime-image";

type SuggestionItem = {
  id: string;
  slug: string;
  label: string;
  meta: string;
  posterUrl: string | null;
};

type SearchOption =
  | { id: "search-query"; kind: "QUERY"; label: string }
  | ({ kind: "ANIME" } & SuggestionItem);

// Bolds the matched slice of a suggestion label, like the reference search.
function Highlighted({ label, query }: { label: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{label}</>;
  const index = label.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());
  if (index === -1) return <>{label}</>;
  return (
    <>
      {label.slice(0, index)}
      <span className="font-semibold text-[#F3F8FC]">
        {label.slice(index, index + q.length)}
      </span>
      {label.slice(index + q.length)}
    </>
  );
}

export function SearchBox({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const listboxId = useId();
  const requestIdRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1);

  const normalizedQuery = query.trim();

  // Ctrl/⌘ + K focuses the search, matching the hint shown in the field.
  const focusSearchInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      setIsSearchFocused(true);
    });
  }, []);
  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusSearchInput();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [focusSearchInput]);

  // Debounced suggestion fetch, guarded by an incrementing request id so stale
  // responses can never overwrite fresher ones.
  useEffect(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    if (normalizedQuery.length < 2) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setIsLoadingSuggestions(true);
      apiFetch<{ data: AnimeSummary[] }>(
        `/catalog/suggestions?q=${encodeURIComponent(normalizedQuery)}`,
        { signal: controller.signal },
        true,
      )
        .then((response) => {
          if (controller.signal.aborted || requestId !== requestIdRef.current)
            return;
          setSuggestions(
            response.data.map((anime) => ({
              id: anime.slug,
              slug: anime.slug,
              label: anime.title,
              meta: anime.category?.name ?? "Anime",
              posterUrl: anime.posterUrl ?? null,
            })),
          );
          setActiveOptionIndex(-1);
        })
        .catch((error) => {
          if (controller.signal.aborted || requestId !== requestIdRef.current)
            return;
          console.error(error);
          setSuggestions([]);
        })
        .finally(() => {
          if (controller.signal.aborted || requestId !== requestIdRef.current)
            return;
          setIsLoadingSuggestions(false);
        });
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [normalizedQuery]);

  const options = useMemo<SearchOption[]>(
    () =>
      normalizedQuery.length >= 2
        ? [
            { id: "search-query", kind: "QUERY", label: normalizedQuery },
            ...suggestions.map((item) => ({ kind: "ANIME" as const, ...item })),
          ]
        : [],
    [normalizedQuery, suggestions],
  );

  const isSuggestionsOpen = isSearchFocused && options.length > 0;
  const activeOptionId =
    isSuggestionsOpen && activeOptionIndex >= 0
      ? `${listboxId}-option-${activeOptionIndex}`
      : undefined;

  const submitSearch = useCallback(
    (value?: string) => {
      const q = (value ?? query).trim();
      setIsSearchFocused(false);
      setActiveOptionIndex(-1);
      if (q) router.push(`/buscar?q=${encodeURIComponent(q)}`);
    },
    [query, router],
  );

  const openOption = useCallback(
    (option: SearchOption) => {
      setIsSearchFocused(false);
      setActiveOptionIndex(-1);
      if (option.kind === "QUERY") {
        submitSearch(option.label);
      } else {
        router.push(`/anime/${option.slug}`);
      }
    },
    [router, submitSearch],
  );

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!isSuggestionsOpen) return;
      event.preventDefault();
      setActiveOptionIndex((current) =>
        event.key === "ArrowDown"
          ? current < options.length - 1
            ? current + 1
            : 0
          : current > 0
            ? current - 1
            : options.length - 1,
      );
      return;
    }
    if (event.key === "Enter") {
      if (isSuggestionsOpen && activeOptionIndex >= 0) {
        event.preventDefault();
        openOption(options[activeOptionIndex]);
      }
      return;
    }
    if (event.key === "Escape" && isSuggestionsOpen) {
      event.preventDefault();
      setIsSearchFocused(false);
      setActiveOptionIndex(-1);
    }
  };

  return (
    <div
      className={
        compact
          ? "min-w-0 max-w-xl flex-1 max-[800px]:hidden"
          : "w-full max-w-2xl"
      }
    >
      <div className="relative min-w-0 flex-1">
        <div className="flex w-full overflow-visible rounded-xl border border-white/10 bg-[#0B1621] transition-[background-color,box-shadow] duration-200 focus-within:border-[#2F81F7]/45 focus-within:bg-[#0E1B2B] focus-within:shadow-[0_0_0_2px_rgba(91,156,255,.3)]">
          <SearchField
            aria-label="Buscar anime"
            className="w-full min-w-0 flex-1"
            value={query}
            onBlur={() => {
              window.setTimeout(() => {
                setIsSearchFocused(false);
                setActiveOptionIndex(-1);
              }, 80);
            }}
            onChange={(value) => {
              setQuery(value);
              setIsSearchFocused(true);
              if (value.trim().length < 2) {
                setSuggestions([]);
                setIsLoadingSuggestions(false);
                setActiveOptionIndex(-1);
              }
            }}
            onFocus={() => setIsSearchFocused(true)}
            onSubmit={submitSearch}
          >
            <SearchField.Group className="h-11 w-full rounded-xl border-0 bg-transparent shadow-none focus-within:ring-0 data-[focus-within=true]:ring-0">
              <SearchField.Input
                ref={searchInputRef}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={isSuggestionsOpen}
                aria-controls={isSuggestionsOpen ? listboxId : undefined}
                aria-activedescendant={activeOptionId}
                placeholder="Buscar anime"
                className="min-w-0 flex-1 px-4 py-0 text-sm text-[#F3F8FC] placeholder:text-[#718596]"
                onKeyDown={handleInputKeyDown}
              />
              {!query && !isSearchFocused && (
                <kbd className="pointer-events-none mr-1.5 hidden shrink-0 select-none items-center gap-1 rounded-md border border-white/10 bg-[#111C2C] px-1.5 py-0.5 font-mono text-[10px] text-[#7F93A8] md:flex">
                  <span>Ctrl</span>
                  <span>K</span>
                </kbd>
              )}
              <SearchField.ClearButton
                aria-label="Limpiar búsqueda"
                className="mr-1 text-[#8FA3B4] hover:text-[#F3F8FC]"
              />
              <Button
                aria-label="Buscar"
                isIconOnly
                size="sm"
                variant="tertiary"
                className="h-full min-w-11 rounded-none rounded-r-xl border-l border-white/10 px-0 text-[#8FB0DD] shadow-none hover:bg-[#152439] hover:text-[#F3F8FC]"
                onPress={() => submitSearch()}
              >
                <Search className="size-4" />
              </Button>
            </SearchField.Group>
          </SearchField>

          {isSuggestionsOpen ? (
            <div
              className="search-suggestions absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border border-white/10 bg-[#0B1621] shadow-[0_22px_70px_rgba(0,0,0,.5)]"
              onMouseDown={(event) => event.preventDefault()}
            >
              <div
                aria-label="Sugerencias de búsqueda"
                className="max-h-[min(70vh,26rem)] overflow-y-auto p-1.5"
                id={listboxId}
                role="listbox"
              >
                {options.map((option, index) => {
                  const isActive = index === activeOptionIndex;
                  const optionId = `${listboxId}-option-${index}`;
                  if (option.kind === "QUERY") {
                    return (
                      <button
                        aria-selected={isActive}
                        className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-sm text-[#C4D2DE] outline-none transition-colors hover:bg-[#102130] aria-selected:bg-[#102130]"
                        id={optionId}
                        key={option.id}
                        role="option"
                        type="button"
                        onClick={() => openOption(option)}
                        onMouseEnter={() => setActiveOptionIndex(index)}
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[#111E31] text-[#69A7FF]">
                          <Search className="size-4" />
                        </span>
                        <span className="min-w-0 truncate">
                          Buscar{" "}
                          <span className="font-semibold text-[#F3F8FC]">
                            “{option.label}”
                          </span>
                        </span>
                      </button>
                    );
                  }
                  return (
                    <button
                      aria-selected={isActive}
                      className="flex w-full min-w-0 items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-[#102130] aria-selected:bg-[#102130]"
                      id={optionId}
                      key={option.id}
                      role="option"
                      type="button"
                      onClick={() => openOption(option)}
                      onMouseEnter={() => setActiveOptionIndex(index)}
                    >
                      <span className="relative block h-12 w-9 shrink-0 overflow-hidden rounded-md bg-[#0A1220]">
                        <AnimeImage
                          src={option.posterUrl}
                          alt=""
                          sizes="36px"
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-[#F3F8FC]">
                          <Highlighted
                            label={option.label}
                            query={normalizedQuery}
                          />
                        </span>
                        <span className="block truncate text-xs text-[#8FA3B4]">
                          {option.meta}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {isLoadingSuggestions ? (
                  <div
                    className="px-3 py-2 text-xs text-[#8FA3B4]"
                    role="status"
                  >
                    Cargando sugerencias…
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
