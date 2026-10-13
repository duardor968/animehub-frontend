"use client";

import { Spinner } from "@heroui/react";
import { paginationVariants } from "@heroui/styles";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { formatNumber } from "@/lib/format";

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

const slots = paginationVariants();

const isPlainClick = (event: MouseEvent) =>
  !event.defaultPrevented &&
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

/**
 * HeroUI pagination. With `href` every page is a crawlable link (new tab on
 * Ctrl/middle click) and `onChange` takes over plain clicks; without it the
 * pages are buttons. Phones show the arrows around "7 de 50".
 */
export function Pagination({
  page,
  totalPages,
  href,
  onChange,
  pendingPage,
  label = "Paginación",
  className = "",
}: {
  page: number;
  totalPages: number;
  href?: (page: number) => string;
  onChange?: (page: number) => void;
  /** Page being loaded: its control shows a spinner. */
  pendingPage?: number;
  label?: string;
  className?: string;
}) {
  if (totalPages <= 1 || page < 1 || page > totalPages) return null;

  const control = (
    target: number,
    children: ReactNode,
    ariaLabel: string,
    nav = false,
  ) => {
    const linkClass = `${slots.link()}${nav ? " pagination__link--nav" : ""}`;
    if (!nav && target === page)
      return (
        <span className={linkClass} data-active="true" aria-current="page">
          {children}
        </span>
      );
    if (target < 1 || target > totalPages)
      return (
        <span className={linkClass} aria-disabled="true" aria-label={ariaLabel}>
          {children}
        </span>
      );
    const busy = target === pendingPage;
    const spinner = <Spinner size="sm" color="current" aria-hidden="true" />;
    // The page number spins in its place. Phones hide the numbers, so there
    // the arrow shows it over its own label, keeping its width.
    const content = !busy ? (
      children
    ) : !nav ? (
      spinner
    ) : (
      <span className="grid place-items-center *:[grid-area:1/1]">
        <span className="inline-flex items-center gap-1.5 max-sm:invisible">
          {children}
        </span>
        <span className="sm:hidden">{spinner}</span>
      </span>
    );
    if (href)
      return (
        <Link
          className={linkClass}
          href={href(target)}
          prefetch={false}
          aria-label={ariaLabel}
          aria-busy={busy || undefined}
          onClick={(event) => {
            if (!onChange || !isPlainClick(event)) return;
            event.preventDefault();
            onChange(target);
          }}
        >
          {content}
        </Link>
      );
    return (
      <button
        type="button"
        className={linkClass}
        aria-label={ariaLabel}
        aria-busy={busy || undefined}
        onClick={() => onChange?.(target)}
      >
        {content}
      </button>
    );
  };

  return (
    <nav aria-label={label} className={`${slots.base()} ${className}`}>
      <ul className={`${slots.content()} self-center`}>
        <li className={slots.item()}>
          {control(
            page - 1,
            <>
              <ChevronLeft aria-hidden="true" size={16} />
              Anterior
            </>,
            "Página anterior",
            true,
          )}
        </li>
        <li className={`${slots.item()} sm:hidden`}>
          <span className="px-2 text-sm tabular-nums text-muted">
            <span className="text-foreground">{formatNumber(page)}</span> de{" "}
            {formatNumber(totalPages)}
          </span>
        </li>
        {paginationItems(page, totalPages).map((item) => (
          <li key={item} className={`${slots.item()} max-sm:hidden`}>
            {typeof item === "number" ? (
              control(item, formatNumber(item), `Página ${item}`)
            ) : (
              <span aria-hidden="true" className={slots.ellipsis()}>
                …
              </span>
            )}
          </li>
        ))}
        <li className={slots.item()}>
          {control(
            page + 1,
            <>
              Siguiente
              <ChevronRight aria-hidden="true" size={16} />
            </>,
            "Página siguiente",
            true,
          )}
        </li>
      </ul>
    </nav>
  );
}
