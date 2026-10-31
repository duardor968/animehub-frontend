"use client";

import {
  Button,
  CloseButton,
  InputGroup,
  Kbd,
  Skeleton,
  TextField,
  Tooltip,
} from "@heroui/react";
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
  useLayoutEffect,
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
/** The most titles /catalog/suggestions returns (its contract: "hasta ocho"). */
const SUGGESTION_LIMIT = 8;
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

const yearOf = (date?: string | null) =>
  date ? String(new Date(date).getUTCFullYear()) : null;

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
  // The arrows moved the active option last (it also shows the focus border).
  const [isActiveByKeyboard, setIsActiveByKeyboard] = useState(false);
  const isApple = useSyncExternalStore(
    subscribeNever,
    isApplePlatform,
    () => false,
  );

  const normalizedQuery = query.trim();
  const hasSuggestionQuery = normalizedQuery.length >= SUGGESTION_MIN_LENGTH;
  const isLoadingSuggestions =
    hasSuggestionQuery && result?.query !== normalizedQuery;
  // Only the answer for what is typed now. While it loads, skeleton rows
  // stand in for as many titles as the last answer had (the most the API
  // gives before the first one), so the list keeps its height.
  const suggestions =
    hasSuggestionQuery && !isLoadingSuggestions ? (result?.items ?? []) : [];
  const skeletonRows = isLoadingSuggestions
    ? (result?.items.length ?? SUGGESTION_LIMIT)
    : 0;

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
              meta: [yearOf(anime.startDate), anime.category?.name ?? "Anime"]
                .filter(Boolean)
                .join(" · "),
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

  // The list's height follows its content (skeleton, then the answer) with a
  // transition (globals.css) instead of jumping: the frame holds the last
  // measured height until the new one is set.
  const contentRef = useRef<HTMLDivElement>(null);
  const [frameHeight, setFrameHeight] = useState<number>();
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() =>
      setFrameHeight(content.offsetHeight),
    );
    observer.observe(content);
    return () => {
      observer.disconnect();
      // Reopened, the list starts from its own height.
      setFrameHeight(undefined);
    };
  }, [isSuggestionsOpen]);

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

  // What Enter and the search button do.
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

  const clearQuery = () => {
    setQuery("");
    setActiveOptionIndex(-1);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      handleSubmit();
      return;
    }
    // With the list closed (see handleKeyDownCapture), Escape clears.
    if (event.key === "Escape" && query) {
      event.preventDefault();
      clearQuery();
      return;
    }
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

  // The first Escape only closes the list; a second one clears the field.
  // Capture phase so this runs before the input's handlers.
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
      className={`search-box relative min-w-0 ${compact ? "max-w-xl flex-1 max-lg:hidden" : "w-full max-w-2xl"}`}
      onKeyDownCapture={handleKeyDownCapture}
    >
      <TextField
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
      >
        <InputGroup fullWidth>
          <InputGroup.Input
            ref={searchInputRef}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isSuggestionsOpen}
            aria-controls={isSuggestionsOpen ? listboxId : undefined}
            aria-activedescendant={activeOptionId}
            aria-keyshortcuts={isApple ? "Meta+K" : "Control+K"}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="search"
            maxLength={SEARCH_MAX_LENGTH}
            spellCheck={false}
            placeholder="Buscar anime"
            onKeyDown={handleInputKeyDown}
          />
          <InputGroup.Suffix>
            {query ? (
              <Tooltip delay={300}>
                {/* Escape clears from the keyboard. */}
                <CloseButton
                  aria-label={CLEAR_LABEL}
                  excludeFromTabOrder
                  preventFocusOnPress
                  onPress={clearQuery}
                />
                <Tooltip.Content>{CLEAR_LABEL}</Tooltip.Content>
              </Tooltip>
            ) : (
              // The shortcut, at rest only (hidden on focus and on touch
              // screens, see globals.css); the input carries it for
              // assistive tech.
              <Kbd aria-hidden="true">
                {isApple ? (
                  <Kbd.Abbr keyValue="command" />
                ) : (
                  <Kbd.Content>Ctrl</Kbd.Content>
                )}
                <Kbd.Content>K</Kbd.Content>
              </Kbd>
            )}
            <Tooltip delay={300}>
              <Button
                aria-label="Buscar"
                className="search-box__submit"
                isIconOnly
                preventFocusOnPress
                variant="tertiary"
                onPress={handleSubmit}
              >
                <Search aria-hidden="true" />
              </Button>
              <Tooltip.Content>Buscar</Tooltip.Content>
            </Tooltip>
          </InputGroup.Suffix>
        </InputGroup>
      </TextField>

      {isSuggestionsOpen ? (
        <div
          className={`${popoverClass} absolute inset-x-0 top-full z-50 mt-2 overflow-hidden`}
          onMouseDown={(event) => event.preventDefault()}
        >
          <div
            className="search-suggestions-frame"
            style={{ height: frameHeight }}
          >
            <div ref={contentRef}>
              <div
                aria-label="Sugerencias de búsqueda"
                aria-busy={isLoadingSuggestions}
                className={`${listboxClass} search-suggestions overflow-y-auto overscroll-contain`}
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
                    className={optionClass}
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
                        {/* In the posters' column, so icon and text line up
                        with the rows below. */}
                        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent-soft text-link">
                          <Search aria-hidden="true" className="size-4" />
                        </span>
                        <span className="min-w-0 truncate text-subtle">
                          Buscar{" "}
                          <span className="font-semibold text-foreground">
                            «{option.label}»
                          </span>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="relative block h-12 w-9 shrink-0 overflow-hidden rounded-md">
                          <AnimeImage
                            src={option.posterUrl}
                            alt=""
                            sizes="36px"
                          />
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
                {Array.from({ length: skeletonRows }, (_, row) => (
                  <div key={row} aria-hidden="true" className={optionClass}>
                    <Skeleton className="h-12 w-9 shrink-0 rounded-md" />
                    <span className="flex flex-1 flex-col gap-1.5">
                      <Skeleton className="h-3.5 w-3/5" />
                      <Skeleton className="h-3 w-1/4" />
                    </span>
                  </div>
                ))}
              </div>
              {failed ? (
                <p aria-hidden="true" className="px-4 pb-3 text-xs text-muted">
                  No se pudieron cargar las sugerencias.
                </p>
              ) : null}
            </div>
          </div>
          <div role="status" className="sr-only">
            {announcement}
          </div>
        </div>
      ) : null}
    </div>
  );
}
