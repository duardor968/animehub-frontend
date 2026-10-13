"use client";

import { Button, Tooltip, Typography } from "@heroui/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Titled horizontal list. Cards snap to the start edge, so paging never
 * leaves a cut card on the left; touch users swipe, mouse users get
 * previous/next buttons beside the title.
 */
export function RelatedScroller({
  title,
  children,
}: {
  title: string;
  /** The `<li>` items, each with `snap-start`. */
  children: ReactNode;
}) {
  const titleId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  // Booleans, so a scroll that stays between the edges doesn't re-render.
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () => {
      setAtStart(list.scrollLeft <= 1);
      setAtEnd(list.scrollLeft >= list.scrollWidth - list.clientWidth - 1);
    };
    update();
    list.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(list);
    return () => {
      list.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  function page(direction: 1 | -1) {
    const list = listRef.current;
    if (!list) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    list.scrollBy({
      left: direction * list.clientWidth,
      behavior: reduce.matches ? "auto" : "smooth",
    });
  }

  const arrow = (direction: 1 | -1) => {
    const label = direction < 0 ? "Anteriores" : "Siguientes";
    return (
      <Tooltip delay={300}>
        <Button
          isIconOnly
          size="sm"
          variant="tertiary"
          aria-label={label}
          isDisabled={direction < 0 ? atStart : atEnd}
          onPress={() => page(direction)}
        >
          {direction < 0 ? (
            <ChevronLeft aria-hidden="true" />
          ) : (
            <ChevronRight aria-hidden="true" />
          )}
        </Button>
        <Tooltip.Content>{label}</Tooltip.Content>
      </Tooltip>
    );
  };

  return (
    <section aria-labelledby={titleId}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <Typography type="h2" id={titleId}>
          {title}
        </Typography>
        {!(atStart && atEnd) && (
          <div className="flex gap-2 pointer-coarse:hidden">
            {arrow(-1)}
            {arrow(1)}
          </div>
        )}
      </div>
      {/* The 4px padding keeps the cards' focus outline inside the
          scrollport; the negative margin and scroll padding cancel it. */}
      <ul
        ref={listRef}
        aria-labelledby={titleId}
        className="-m-1 flex snap-x snap-mandatory scroll-px-1 gap-4 overflow-x-auto p-1 scrollbar-none"
      >
        {children}
      </ul>
    </section>
  );
}
