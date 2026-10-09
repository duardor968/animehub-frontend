"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Synopsis clamped to four lines on phones with a "Leer más" toggle; shown
 * in full from 640px. The toggle is rendered on the server for long texts
 * (no layout shift) and hidden after mount if the text already fits.
 */
export function ExpandableSynopsis({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [fits, setFits] = useState(text.length < 180);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || expanded) return;
    const measure = () =>
      setFits(element.scrollHeight <= element.clientHeight + 1);
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [expanded]);

  return (
    <div className={className}>
      <p
        ref={textRef}
        id="sinopsis"
        className={`max-w-[920px] whitespace-pre-line text-[15px] leading-7 text-subtle ${expanded ? "" : "max-sm:line-clamp-4"}`}
      >
        {text}
      </p>
      {!fits && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="sinopsis"
          onClick={() => setExpanded((current) => !current)}
          className="mt-1 min-h-11 rounded-md text-sm font-semibold text-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus sm:hidden"
        >
          {expanded ? "Leer menos" : "Leer más"}
        </button>
      )}
    </div>
  );
}
