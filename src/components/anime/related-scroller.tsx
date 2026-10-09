"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Horizontal strip for the related-anime timeline: edge fades show there is
 * more content, and previous/next buttons page through it with a mouse
 * (touch users swipe; the buttons are hidden on coarse pointers).
 */
export function RelatedScroller({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const update = () => {
      const max = scroller.scrollWidth - scroller.clientWidth;
      setEdges({
        start: scroller.scrollLeft <= 2,
        end: scroller.scrollLeft >= max - 2,
      });
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, []);

  function page(direction: 1 | -1) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    scroller.scrollBy({
      left: direction * scroller.clientWidth * 0.8,
      behavior: reduce ? "auto" : "smooth",
    });
  }

  const button =
    "grid size-11 place-items-center rounded-full bg-surface-secondary text-foreground shadow-[0_10px_30px_rgb(0_0_0/0.4)] outline-none transition-[opacity,background-color] hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-0 [@media(pointer:coarse)]:hidden";

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        role="region"
        aria-label={label}
        tabIndex={0}
        data-fade-start={!edges.start || undefined}
        data-fade-end={!edges.end || undefined}
        className="related-scroller -mx-1 overflow-x-auto px-1 pb-3 outline-none [scrollbar-width:thin] focus-visible:ring-2 focus-visible:ring-focus"
      >
        {children}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center justify-between">
        <button
          type="button"
          aria-label="Ver anteriores"
          disabled={edges.start}
          onClick={() => page(-1)}
          className={`pointer-events-auto -ml-3 ${button}`}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Ver siguientes"
          disabled={edges.end}
          onClick={() => page(1)}
          className={`pointer-events-auto -mr-3 ${button}`}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
