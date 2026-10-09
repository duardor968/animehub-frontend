"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useId,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { formatNumber } from "@/lib/format";
import {
  pagerCurrentClass,
  pagerLinkClass,
  pagerSpinnerClass,
  pagerUnavailableClass,
} from "../pager-styles";
import { useCatalogNavigation } from "./catalog-navigation";

type PageItem = number | "gap-start" | "gap-end";

/**
 * Numbered window with the first and last page always present and a constant
 * item count, e.g. 1 … 6 7 8 … 50 (page 7) or 1 2 3 4 5 … 50 (page 2).
 */
export function paginationItems(
  page: number,
  totalPages: number,
  siblings = 1,
): PageItem[] {
  const range = (from: number, to: number) =>
    Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
  if (totalPages <= siblings * 2 + 5) return range(1, totalPages);

  const start = Math.max(
    Math.min(page - siblings, totalPages - siblings * 2 - 2),
    3,
  );
  const end = Math.min(
    Math.max(page + siblings, siblings * 2 + 3),
    totalPages - 2,
  );
  return [
    1,
    ...(start > 3 ? (["gap-start"] as const) : [2]),
    ...range(start, end),
    ...(end < totalPages - 2 ? (["gap-end"] as const) : [totalPages - 1]),
    totalPages,
  ];
}

// Pages beyond this count get the "Ir a la página" field next to the numbers.
const jumpThreshold = 7;

const linkClass = pagerLinkClass;

export function Pagination({
  page,
  totalPages,
  query,
}: {
  page: number;
  totalPages: number;
  /** Canonical query of the current results (serializable from the server). */
  query: string;
}) {
  const pathname = usePathname();
  const navigation = useCatalogNavigation();
  const jumpId = useId();
  const [pending, setPending] = useState<{ from: number; to: number } | null>(
    null,
  );
  const [jumpValue, setJumpValue] = useState("");

  if (totalPages <= 1 || page < 1 || page > totalPages) return null;

  const params = new URLSearchParams(query);
  const href = (target: number) => {
    const next = new URLSearchParams(params);
    if (target > 1) next.set("page", String(target));
    else next.delete("page");
    return `${pathname}${next.size ? `?${next}` : ""}`;
  };
  const isPending = Boolean(navigation?.isPending);
  const pendingPage =
    isPending && pending?.from === page ? pending.to : undefined;

  // Paging scrolls to the top and moves keyboard focus to the new results:
  // the clicked link itself becomes the current page (a span).
  const go = (target: number) => {
    const clamped = Math.min(totalPages, Math.max(1, Math.trunc(target)));
    if (clamped === page || !navigation || navigation.isPending) return;
    setPending({ from: page, to: clamped });
    navigation.navigate(href(clamped), { scroll: true, focusResults: true });
  };

  // Plain links stay crawlable and work without JS; with JS they run inside
  // the catalog transition so the grid dims and the target page shows a spinner.
  const onLinkClick = (target: number) => (event: MouseEvent) => {
    if (
      !navigation ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    go(target);
  };

  const onJump = (event: FormEvent<HTMLFormElement>) => {
    if (!navigation) return;
    event.preventDefault();
    if (navigation.isPending) return;
    const target = Number(jumpValue);
    if (!Number.isFinite(target) || jumpValue.trim() === "") return;
    setJumpValue("");
    go(target);
  };

  const pageLink = (target: number) => {
    const isCurrent = target === page;
    const isTarget = target === pendingPage;
    if (isCurrent)
      return (
        <span aria-current="page" className={pagerCurrentClass}>
          <span className="sr-only">Página </span>
          {formatNumber(target)}
        </span>
      );
    return (
      <Link
        href={href(target)}
        onClick={onLinkClick(target)}
        aria-label={`Página ${target}`}
        aria-busy={isTarget || undefined}
        className={`${linkClass} ${isTarget ? "border-link/60 text-foreground" : ""}`}
      >
        {isTarget ? <Spinner /> : formatNumber(target)}
      </Link>
    );
  };

  const arrow = (direction: "prev" | "next") => {
    const target = direction === "prev" ? page - 1 : page + 1;
    const label = direction === "prev" ? "Página anterior" : "Página siguiente";
    const icon =
      direction === "prev" ? (
        <ChevronLeft size={18} aria-hidden="true" />
      ) : (
        <ChevronRight size={18} aria-hidden="true" />
      );
    if (target < 1 || target > totalPages)
      return (
        <span aria-hidden="true" className={pagerUnavailableClass}>
          {icon}
        </span>
      );
    return (
      <Link
        href={href(target)}
        onClick={onLinkClick(target)}
        aria-label={label}
        aria-busy={target === pendingPage || undefined}
        className={linkClass}
      >
        {target === pendingPage ? <Spinner /> : icon}
      </Link>
    );
  };

  const items = paginationItems(page, totalPages);

  return (
    <nav
      className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-4"
      aria-label="Paginación"
    >
      {/* Phones: arrows around a native page picker that doubles as the jump. */}
      <div className="flex items-center gap-2 sm:hidden">
        {arrow("prev")}
        <label className="relative">
          <span className="sr-only">Ir a la página</span>
          {/* 16px text: iOS zooms into smaller form controls. Never disabled
              while loading (that would drop focus); go() ignores changes. */}
          <select
            value={pendingPage ?? page}
            aria-busy={isPending || undefined}
            onChange={(event) => go(Number(event.target.value))}
            className="h-11 min-w-40 appearance-none rounded-xl border border-white/10 bg-surface pl-4 pr-10 text-base font-semibold tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-busy:opacity-70 sm:text-sm"
          >
            {Array.from({ length: totalPages }, (_, index) => (
              <option key={index} value={index + 1}>
                Página {formatNumber(index + 1)} de {formatNumber(totalPages)}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
        </label>
        {arrow("next")}
      </div>

      <ol className="flex items-center gap-1.5 max-sm:hidden">
        <li>{arrow("prev")}</li>
        {items.map((item) =>
          typeof item === "number" ? (
            <li key={item}>{pageLink(item)}</li>
          ) : (
            <li
              key={item}
              aria-hidden="true"
              className="grid w-7 place-items-center text-sm text-faint"
            >
              …
            </li>
          ),
        )}
        <li>{arrow("next")}</li>
      </ol>

      {totalPages > jumpThreshold && (
        <form
          action={pathname}
          method="get"
          onSubmit={onJump}
          className="flex items-center gap-2 text-sm text-muted max-sm:hidden"
        >
          {[...params.entries()]
            .filter(([key]) => key !== "page")
            .map(([key, value], index) => (
              <input
                key={`${key}-${index}`}
                type="hidden"
                name={key}
                value={value}
              />
            ))}
          <label htmlFor={jumpId}>Ir a la página</label>
          <input
            id={jumpId}
            name="page"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            required
            value={jumpValue}
            onChange={(event) =>
              setJumpValue(event.target.value.replace(/\D/g, "").slice(0, 3))
            }
            aria-describedby={`${jumpId}-total`}
            className="h-11 w-16 rounded-xl border border-white/10 bg-surface-secondary px-3 text-center text-sm font-semibold tabular-nums text-foreground outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
          <span id={`${jumpId}-total`}>de {formatNumber(totalPages)}</span>
          <button
            type="submit"
            aria-disabled={isPending || undefined}
            className="h-11 rounded-full bg-accent-soft px-4 font-semibold text-accent-soft-foreground outline-none transition-colors hover:bg-accent-soft-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-disabled:opacity-60"
          >
            Ir
          </button>
        </form>
      )}
    </nav>
  );
}

function Spinner(): ReactNode {
  return <span aria-hidden="true" className={pagerSpinnerClass} />;
}
