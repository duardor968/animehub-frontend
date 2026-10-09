"use client";

import { Button, SearchField } from "@heroui/react";
import { LoaderCircle, Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { apiFetch, type AnimeSummary } from "@/lib/api/client";
import { plural } from "@/lib/format";
import { AnimeImage } from "./anime-image";

/** Longest query the catalog API accepts (longer ones are rejected with 400). */
export const SEARCH_MAX_LENGTH = 100;
const SUGGESTION_DEBOUNCE_MS = 220;
// Set by the header shortcut when it has to open /buscar instead of focusing a
// hidden field; the page's search box consumes it to take focus on arrival.
const FOCUS_ON_ARRIVAL_KEY = "animehub:focus-search";

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

type SuggestionResult = {
  query: string;
  items: SuggestionItem[];
  failed: boolean;
};

const diacritics = /\p{Diacritic}/gu;
const foldChar = (char: string) =>
  char.normalize("NFD").replace(diacritics, "").toLocaleLowerCase("es");

/**
 * Finds `query` in `label` ignoring case and accents ("accion" matches
 * "Acción") and returns the matching range in the original label.
 */
export function findMatch(label: string, query: string) {
  const needle = [...query.trim()].map(foldChar).join("");
  if (!needle) return null;
  let folded = "";
  const starts: number[] = [];
  let offset = 0;
  for (const char of label) {
    const piece = foldChar(char);
    for (let index = 0; index < piece.length; index += 1) starts.push(offset);
    folded += piece;
    offset += char.length;
  }
  starts.push(offset);
  const index = folded.indexOf(needle);
  if (index === -1) return null;
  return { start: starts[index], end: starts[index + needle.length] };
}

// Bolds the matched slice of a suggestion label, like the reference search.
function Highlighted({ label, query }: { label: string; query: string }) {
  const match = findMatch(label, query);
  if (!match) return <>{label}</>;
  return (
    <>
      {label.slice(0, match.start)}
      <span className="font-semibold text-foreground">
        {label.slice(match.start, match.end)}
      </span>
      {label.slice(match.end)}
    </>
  );
}

const subscribeNever = () => () => {};
const isApplePlatform = () => {
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  return /mac|iphone|ipad|ipod/i.test(
    nav.userAgentData?.platform ?? nav.platform ?? "",
  );
};

/** Whether a modal dialog (drawer, alert…) currently owns the keyboard. */
const isModalOpen = () =>
  Boolean(
    document.querySelector(
      '[role="dialog"][aria-modal="true"], [role="alertdialog"], [data-slot="drawer-dialog"], dialog[open]',
    ),
  );

export function SearchBox({
  compact = false,
  initialQuery = "",
  label = "Buscar anime",
  describedBy,
}: {
  /** Header variant: hidden below lg, where the header shows a search link. */
  compact?: boolean;
  initialQuery?: string;
  /** Accessible name of the combobox. */
  label?: string;
  /** Id of a hint rendered by the page (e.g. minimum query length). */
  describedBy?: string;
}) {
  const pathname = usePathname();
  // The header instance starts empty again after every navigation; the page
  // instance follows the query in the URL.
  return (
    <SearchBoxState
      key={compact ? pathname : initialQuery}
      compact={compact}
      initialQuery={compact ? "" : initialQuery}
      label={label}
      describedBy={describedBy}
    />
  );
}

function SearchBoxState({
  compact,
  initialQuery,
  label,
  describedBy,
}: {
  compact: boolean;
  initialQuery: string;
  label: string;
  describedBy?: string;
}) {
  const router = useRouter();
  const listboxId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery.slice(0, SEARCH_MAX_LENGTH));
  const [result, setResult] = useState<SuggestionResult | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1);
  const isApple = useSyncExternalStore(
    subscribeNever,
    isApplePlatform,
    () => false,
  );

  const normalizedQuery = query.trim().slice(0, SEARCH_MAX_LENGTH);
  const hasSuggestionQuery = normalizedQuery.length >= 2;
  const isLoadingSuggestions =
    hasSuggestionQuery && result?.query !== normalizedQuery;
  // Previous results stay visible (dimmed) while the next query loads, so the
  // list doesn't collapse and re-expand on every keystroke.
  const suggestions = useMemo(
    () => (hasSuggestionQuery ? (result?.items ?? []) : []),
    [hasSuggestionQuery, result],
  );

  const focusInput = useCallback(() => {
    const input = searchInputRef.current;
    if (!input) return;
    input.focus();
    // Keep typed text: the caret goes to the end instead of the start.
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }, []);

  // Ctrl/⌘ + K focuses the visible search field (the hint shown in the field).
  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "k" ||
        isModalOpen()
      )
        return;
      const input = searchInputRef.current;
      if (!input) return;
      if (input.getClientRects().length > 0) {
        event.preventDefault();
        focusInput();
      } else if (compact) {
        // The header field is hidden below lg: open the search page instead.
        event.preventDefault();
        try {
          sessionStorage.setItem(FOCUS_ON_ARRIVAL_KEY, "1");
        } catch {
          // Storage unavailable: the page opens without auto-focus.
        }
        router.push("/buscar");
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [compact, focusInput, router]);

  useEffect(() => {
    if (compact) return;
    try {
      if (sessionStorage.getItem(FOCUS_ON_ARRIVAL_KEY)) {
        sessionStorage.removeItem(FOCUS_ON_ARRIVAL_KEY);
        focusInput();
      }
    } catch {
      // Storage unavailable: nothing to consume.
    }
  }, [compact, focusInput]);

  // Debounced suggestion fetch, only while the field is focused. Aborting on
  // every change means a stale response can never overwrite a fresher one.
  useEffect(() => {
    if (!isSearchFocused || !hasSuggestionQuery) return;
    if (result?.query === normalizedQuery) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      apiFetch<{ data: AnimeSummary[] }>(
        `/catalog/suggestions?q=${encodeURIComponent(normalizedQuery)}`,
        { signal: controller.signal },
        true,
      )
        .then((response) => {
          if (controller.signal.aborted) return;
          setResult({
            query: normalizedQuery,
            failed: false,
            items: response.data.map((anime) => ({
              id: anime.slug,
              slug: anime.slug,
              label: anime.title,
              meta: anime.category?.name ?? "Anime",
              posterUrl: anime.posterUrl ?? null,
            })),
          });
          setActiveOptionIndex((current) => (current > 0 ? -1 : current));
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          console.error(error);
          setResult({ query: normalizedQuery, failed: true, items: [] });
        });
    }, SUGGESTION_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [hasSuggestionQuery, isSearchFocused, normalizedQuery, result?.query]);

  const options = useMemo<SearchOption[]>(
    () =>
      hasSuggestionQuery
        ? [
            { id: "search-query", kind: "QUERY", label: normalizedQuery },
            ...suggestions.map((item) => ({ kind: "ANIME" as const, ...item })),
          ]
        : [],
    [hasSuggestionQuery, normalizedQuery, suggestions],
  );

  const isSuggestionsOpen = isSearchFocused && options.length > 0;
  const activeOptionId =
    isSuggestionsOpen && activeOptionIndex >= 0
      ? `${listboxId}-option-${activeOptionIndex}`
      : undefined;

  // Keyboard navigation can move past the visible part of the scrolling list.
  useEffect(() => {
    if (activeOptionId)
      document
        .getElementById(activeOptionId)
        ?.scrollIntoView({ block: "nearest" });
  }, [activeOptionId]);

  const closeSuggestions = useCallback(() => {
    setIsSearchFocused(false);
    setActiveOptionIndex(-1);
  }, []);

  const submitSearch = useCallback(
    (value?: string) => {
      const q = (value ?? query).trim().slice(0, SEARCH_MAX_LENGTH);
      closeSuggestions();
      if (q) router.push(`/buscar?q=${encodeURIComponent(q)}`);
      else if (compact) router.push("/buscar");
      else focusInput();
    },
    [closeSuggestions, compact, focusInput, query, router],
  );

  const openOption = useCallback(
    (option: SearchOption) => {
      if (option.kind === "QUERY") {
        submitSearch(option.label);
        return;
      }
      closeSuggestions();
      router.push(`/anime/${option.slug}`);
    },
    [closeSuggestions, router, submitSearch],
  );

  // Enter is handled by SearchField's onSubmit (React Aria runs it before any
  // input onKeyDown), so this is the single place that decides what Enter does.
  const handleSubmit = () => {
    if (isSuggestionsOpen && activeOptionIndex >= 0)
      openOption(options[activeOptionIndex]);
    else submitSearch();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (!isSuggestionsOpen) {
      if (hasSuggestionQuery) setIsSearchFocused(true);
      return;
    }
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
  };

  // The first Escape only closes the list; React Aria's own Escape handler
  // (which clears the field) runs on a second press. Capture phase so this
  // runs before the input's handlers.
  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !isSuggestionsOpen) return;
    event.preventDefault();
    event.stopPropagation();
    closeSuggestions();
  };

  const status = isLoadingSuggestions
    ? "Buscando sugerencias…"
    : result?.failed
      ? "No se pudieron cargar las sugerencias."
      : suggestions.length === 0
        ? `Sin sugerencias para “${normalizedQuery}”. Pulsa Intro para buscar.`
        : null;
  const announcement = isLoadingSuggestions
    ? ""
    : (status ?? plural(suggestions.length, "sugerencia", "sugerencias"));

  return (
    <div
      className={
        compact ? "min-w-0 max-w-xl flex-1 max-lg:hidden" : "w-full max-w-2xl"
      }
    >
      <div className="relative min-w-0 flex-1">
        <div
          className="flex w-full overflow-visible rounded-xl border border-white/10 bg-surface transition-[background-color,box-shadow] duration-200 focus-within:border-accent/45 focus-within:bg-surface-secondary focus-within:shadow-[0_0_0_2px_rgba(91,156,255,.3)]"
          onKeyDownCapture={handleKeyDownCapture}
        >
          <SearchField
            aria-label={label}
            className="w-full min-w-0 flex-1"
            value={query}
            onBlur={() => {
              window.setTimeout(closeSuggestions, 80);
            }}
            onChange={(value) => {
              setQuery(value.slice(0, SEARCH_MAX_LENGTH));
              setIsSearchFocused(true);
              setActiveOptionIndex(-1);
            }}
            onFocus={() => setIsSearchFocused(true)}
            onSubmit={handleSubmit}
          >
            <SearchField.Group className="h-11 w-full rounded-xl border-0 bg-transparent shadow-none focus-within:ring-0 data-[focus-within=true]:ring-0">
              <SearchField.Input
                ref={searchInputRef}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={isSuggestionsOpen}
                aria-controls={isSuggestionsOpen ? listboxId : undefined}
                aria-activedescendant={activeOptionId}
                aria-describedby={describedBy}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                enterKeyHint="search"
                maxLength={SEARCH_MAX_LENGTH}
                spellCheck={false}
                placeholder="Buscar anime"
                // 16px on touch screens and narrow windows: iOS zooms into
                // inputs whose text is smaller than that.
                className="min-w-0 flex-1 px-4 py-0 text-base text-foreground placeholder:text-faint lg:pointer-fine:text-sm"
                onKeyDown={handleInputKeyDown}
              />
              {!query && !isSearchFocused && (
                <kbd
                  aria-hidden="true"
                  className="pointer-events-none mr-1.5 hidden shrink-0 select-none items-center gap-1 rounded-md border border-white/10 bg-surface-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted md:pointer-fine:flex"
                >
                  <span>{isApple ? "⌘" : "Ctrl"}</span>
                  <span>K</span>
                </kbd>
              )}
              <SearchField.ClearButton
                aria-label="Limpiar búsqueda"
                className="me-1 size-9 text-muted hover:text-foreground pointer-coarse:size-11 [&_[data-slot=close-button-icon]]:size-3.5"
              />
              <Button
                aria-label="Buscar"
                isIconOnly
                size="sm"
                variant="tertiary"
                className="h-full min-w-11 rounded-none rounded-r-xl border-l border-white/10 px-0 text-muted shadow-none hover:bg-accent-soft hover:text-foreground"
                onPress={() => submitSearch()}
              >
                <Search aria-hidden="true" className="size-4" />
              </Button>
            </SearchField.Group>
          </SearchField>

          {isSuggestionsOpen ? (
            <div
              className="search-suggestions absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border border-white/10 bg-surface shadow-[0_22px_70px_rgba(0,0,0,.5)]"
              onMouseDown={(event) => event.preventDefault()}
            >
              <div
                aria-label="Sugerencias de búsqueda"
                aria-busy={isLoadingSuggestions}
                className="max-h-[min(70dvh,26rem)] overflow-y-auto overscroll-contain p-1.5"
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
                        className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-sm text-subtle outline-none transition-colors hover:bg-surface-hover aria-selected:bg-surface-hover"
                        id={optionId}
                        key={option.id}
                        role="option"
                        tabIndex={-1}
                        type="button"
                        onClick={() => openOption(option)}
                        onMouseEnter={() => setActiveOptionIndex(index)}
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-secondary text-link">
                          <Search aria-hidden="true" className="size-4" />
                        </span>
                        <span className="min-w-0 truncate">
                          Buscar{" "}
                          <span className="font-semibold text-foreground">
                            “{option.label}”
                          </span>
                        </span>
                      </button>
                    );
                  }
                  return (
                    <button
                      aria-selected={isActive}
                      className={`flex w-full min-w-0 items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none transition-[background-color,opacity] hover:bg-surface-hover aria-selected:bg-surface-hover ${isLoadingSuggestions ? "opacity-55" : ""}`}
                      id={optionId}
                      key={option.id}
                      role="option"
                      tabIndex={-1}
                      type="button"
                      onClick={() => openOption(option)}
                      onMouseEnter={() => setActiveOptionIndex(index)}
                    >
                      <span className="relative block h-12 w-9 shrink-0 overflow-hidden rounded-md bg-surface">
                        <AnimeImage
                          src={option.posterUrl}
                          alt=""
                          sizes="36px"
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-foreground">
                          <Highlighted
                            label={option.label}
                            query={normalizedQuery}
                          />
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {option.meta}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {/* Outside the listbox (which may only hold options) and outside
                  the scroll area, so it stays visible however far the list is
                  scrolled. Screen readers get the summary from the live region
                  below instead of every intermediate "searching" state. */}
              {status ? (
                <div
                  aria-hidden="true"
                  className="flex items-center gap-2 border-t border-white/8 px-4 py-2.5 text-xs text-muted"
                >
                  {isLoadingSuggestions ? (
                    <LoaderCircle className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
                  ) : null}
                  <span className="min-w-0 truncate">{status}</span>
                </div>
              ) : null}
              <div role="status" className="sr-only">
                {announcement}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
