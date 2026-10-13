"use client";

import { Kbd, SearchField, Spinner, Tooltip } from "@heroui/react";
import {
  listboxItemVariants,
  listboxVariants,
  popoverVariants,
} from "@heroui/styles";
import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { apiFetch, type AnimeSummary } from "@/lib/api/client";
import { plural } from "@/lib/format";
import { AnimeImage } from "./anime-image";

/** Longest query the catalog API accepts (longer ones are rejected with 400). */
const SEARCH_MAX_LENGTH = 100;
/** Shortest query the suggestions endpoint accepts. */
const SUGGESTION_MIN_LENGTH = 2;
const SUGGESTION_DEBOUNCE_MS = 220;
// Set when a search box opens /buscar with a query and the page's field
// replaces it (the header's is hidden there; the page's remounts per query):
// the page's search box consumes it to take focus on arrival. Without a query
// the page's field takes focus anyway.
const FOCUS_ON_ARRIVAL_KEY = "animehub:focus-search";
const CLEAR_LABEL = "Limpiar búsqueda";

const popoverClass = popoverVariants().base();
const listboxClass = listboxVariants();
const optionClass = listboxItemVariants().item();

type SuggestionItem = {
  slug: string;
  label: string;
  meta: string;
  posterUrl: string | null;
};

type SearchOption =
  { kind: "QUERY"; label: string } | ({ kind: "ANIME" } & SuggestionItem);

const searchHref = (q: string) => `/buscar?q=${encodeURIComponent(q)}`;
const optionHref = (option: SearchOption) =>
  option.kind === "QUERY" ? searchHref(option.label) : `/anime/${option.slug}`;

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
}: {
  /** Header variant: hidden below lg, where the header shows a search link. */
  compact?: boolean;
  initialQuery?: string;
}) {
  const pathname = usePathname();
  // The header instance starts empty again after every navigation; the page
  // instance follows the query in the URL.
  return (
    <SearchBoxState
      key={compact ? pathname : initialQuery}
      compact={compact}
      initialQuery={initialQuery}
    />
  );
}

function SearchBoxState({
  compact,
  initialQuery,
}: {
  compact: boolean;
  initialQuery: string;
}) {
  const router = useRouter();
  const listboxId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Set while the field takes focus on arrival (see FOCUS_ON_ARRIVAL_KEY).
  const isArrivingRef = useRef(false);
  const [query, setQuery] = useState(initialQuery.slice(0, SEARCH_MAX_LENGTH));
  const [result, setResult] = useState<SuggestionResult | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1);
  // The arrows moved the active option last (it also shows the focus ring).
  const [isActiveByKeyboard, setIsActiveByKeyboard] = useState(false);
  const [isShortcutShown, setIsShortcutShown] = useState(false);
  const isApple = useSyncExternalStore(
    subscribeNever,
    isApplePlatform,
    () => false,
  );

  const normalizedQuery = query.trim();
  const hasSuggestionQuery = normalizedQuery.length >= SUGGESTION_MIN_LENGTH;
  const isLoadingSuggestions =
    hasSuggestionQuery && result?.query !== normalizedQuery;
  // Previous results stay visible (dimmed) while the next query loads, so the
  // list doesn't collapse and re-expand on every keystroke.
  const suggestions = hasSuggestionQuery ? (result?.items ?? []) : [];

  const focusInput = useCallback(() => {
    const input = searchInputRef.current;
    if (!input) return;
    input.focus();
    // Keep typed text: the caret goes to the end instead of the start.
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }, []);

  // Ctrl/⌘ + K focuses the visible search field.
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
        router.push("/buscar");
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [compact, focusInput, router]);

  // The page's field takes focus on arrival: always without a query (ready to
  // type), with one only after a search from another field. The list waits
  // for the next keystroke either way.
  useEffect(() => {
    if (compact) return;
    let takeFocus = !initialQuery;
    try {
      if (sessionStorage.getItem(FOCUS_ON_ARRIVAL_KEY)) {
        sessionStorage.removeItem(FOCUS_ON_ARRIVAL_KEY);
        takeFocus = true;
      }
    } catch {
      // Storage unavailable: nothing to consume.
    }
    if (!takeFocus) return;
    isArrivingRef.current = true;
    focusInput();
    isArrivingRef.current = false;
  }, [compact, focusInput, initialQuery]);

  // Debounced suggestion fetch, only while the field is focused. Aborting on
  // every change means a stale response can never overwrite a fresher one.
  useEffect(() => {
    if (!isSearchFocused || !isLoadingSuggestions) return;
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
  }, [isLoadingSuggestions, isSearchFocused, normalizedQuery]);

  const options: SearchOption[] = normalizedQuery
    ? [
        { kind: "QUERY", label: normalizedQuery },
        ...suggestions.map((item) => ({ kind: "ANIME" as const, ...item })),
      ]
    : [];

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

  const closeSuggestions = () => {
    setIsSearchFocused(false);
    setActiveOptionIndex(-1);
  };

  // Enter is handled by SearchField's onSubmit (React Aria runs it before any
  // input onKeyDown), so this is the single place that decides what Enter does.
  const handleSubmit = () => {
    closeSuggestions();
    const option =
      isSuggestionsOpen && activeOptionIndex >= 0
        ? options[activeOptionIndex]
        : undefined;
    if (option?.kind === "ANIME") router.push(optionHref(option));
    else if (normalizedQuery) {
      // The page's field replaces this one, unless the query is unchanged
      // (compared as /buscar normalizes it): it takes the focus over.
      if (compact || normalizedQuery.replace(/\s+/g, " ") !== initialQuery) {
        try {
          sessionStorage.setItem(FOCUS_ON_ARRIVAL_KEY, "1");
        } catch {
          // Storage unavailable: the page opens without auto-focus.
        }
      }
      router.push(searchHref(normalizedQuery));
    } else if (compact) router.push("/buscar");
    else focusInput();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (!isSuggestionsOpen) {
      if (normalizedQuery) setIsSearchFocused(true);
      return;
    }
    event.preventDefault();
    setIsActiveByKeyboard(true);
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

  const failed = hasSuggestionQuery && !isLoadingSuggestions && result?.failed;
  const announcement = isLoadingSuggestions
    ? ""
    : failed
      ? "No se pudieron cargar las sugerencias."
      : plural(suggestions.length, "sugerencia", "sugerencias");

  return (
    <div
      className={`relative min-w-0 ${compact ? "max-w-xl flex-1 max-lg:hidden" : "w-full max-w-2xl"}`}
      onKeyDownCapture={handleKeyDownCapture}
    >
      {/* The shortcut is an accelerator: it shows on hover, never while the
          field is in use. The trigger only detects the hover: the field
          inside is the control, so it is neither a button nor a tab stop.
          The trigger's focus handlers reach the input too (keyboard focus
          would open it), hence the check on every open. */}
      <Tooltip
        delay={300}
        isOpen={isShortcutShown}
        onOpenChange={(open) =>
          setIsShortcutShown(
            open && document.activeElement !== searchInputRef.current,
          )
        }
      >
        <Tooltip.Trigger className="block w-full" role="none" tabIndex={-1}>
          <SearchField
            aria-label="Buscar anime"
            fullWidth
            value={query}
            onBlur={() => window.setTimeout(closeSuggestions, 80)}
            onChange={(value) => {
              setQuery(value.slice(0, SEARCH_MAX_LENGTH));
              setIsSearchFocused(true);
              setActiveOptionIndex(-1);
            }}
            onFocus={() => {
              if (!isArrivingRef.current) setIsSearchFocused(true);
            }}
            onSubmit={handleSubmit}
          >
            <SearchField.Group>
              <SearchField.SearchIcon>
                {isLoadingSuggestions && isSuggestionsOpen ? (
                  <Spinner size="sm" color="current" aria-hidden="true" />
                ) : (
                  <Search aria-hidden="true" />
                )}
              </SearchField.SearchIcon>
              <SearchField.Input
                ref={searchInputRef}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={isSuggestionsOpen}
                aria-controls={isSuggestionsOpen ? listboxId : undefined}
                aria-activedescendant={activeOptionId}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                enterKeyHint="search"
                maxLength={SEARCH_MAX_LENGTH}
                spellCheck={false}
                placeholder="Buscar anime…"
                onKeyDown={handleInputKeyDown}
              />
              <Tooltip delay={300}>
                <SearchField.ClearButton aria-label={CLEAR_LABEL} />
                <Tooltip.Content>{CLEAR_LABEL}</Tooltip.Content>
              </Tooltip>
            </SearchField.Group>
          </SearchField>
        </Tooltip.Trigger>
        <Tooltip.Content>
          {/* Light: the tooltip is the only box. */}
          <Kbd variant="light">
            {isApple ? (
              <Kbd.Abbr keyValue="command" />
            ) : (
              <Kbd.Content>Ctrl</Kbd.Content>
            )}
            <Kbd.Content>K</Kbd.Content>
          </Kbd>
        </Tooltip.Content>
      </Tooltip>

      {isSuggestionsOpen ? (
        <div
          className={`${popoverClass} absolute inset-x-0 top-full z-50 mt-2 overflow-hidden`}
          onMouseDown={(event) => event.preventDefault()}
        >
          <div
            aria-label="Sugerencias de búsqueda"
            aria-busy={isLoadingSuggestions}
            className={`${listboxClass} search-suggestions max-h-96 overflow-y-auto overscroll-contain`}
            id={listboxId}
            role="listbox"
          >
            {options.map((option, index) => (
              <Link
                aria-selected={index === activeOptionIndex}
                data-focus-visible={
                  (index === activeOptionIndex && isActiveByKeyboard) ||
                  undefined
                }
                className={`${optionClass} ${option.kind === "ANIME" && isLoadingSuggestions ? "opacity-50" : ""}`}
                href={optionHref(option)}
                id={`${listboxId}-option-${index}`}
                key={option.kind === "QUERY" ? "query" : option.slug}
                prefetch={false}
                role="option"
                tabIndex={-1}
                onClick={closeSuggestions}
                // One active option: the pointer moves it like the arrows do.
                // Moves only, so the list opening under a resting pointer
                // or scrolling under it never takes it.
                onPointerMove={(event) => {
                  if (event.pointerType === "touch") return;
                  setIsActiveByKeyboard(false);
                  setActiveOptionIndex(index);
                }}
              >
                {option.kind === "QUERY" ? (
                  <>
                    {/* In the posters' column, so the text lines up
                        with the titles. */}
                    <span className="flex w-9 shrink-0 justify-center">
                      <Search
                        aria-hidden="true"
                        className="size-4 text-muted"
                      />
                    </span>
                    <span className="min-w-0 truncate text-muted">
                      Buscar{" "}
                      <span className="font-semibold text-foreground">
                        «{option.label}»
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="relative block h-12 w-9 shrink-0 overflow-hidden rounded-md">
                      <AnimeImage src={option.posterUrl} alt="" sizes="36px" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-subtle">
                        <Highlighted
                          label={option.label}
                          query={normalizedQuery}
                        />
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {option.meta}
                      </span>
                    </span>
                  </>
                )}
              </Link>
            ))}
          </div>
          {failed ? (
            <p aria-hidden="true" className="px-4 pb-3 text-xs text-muted">
              No se pudieron cargar las sugerencias.
            </p>
          ) : null}
          <div role="status" className="sr-only">
            {announcement}
          </div>
        </div>
      ) : null}
    </div>
  );
}
