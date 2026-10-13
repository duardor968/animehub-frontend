"use client";

import { linkVariants } from "@heroui/styles";
import { useLayoutEffect, useRef, useState } from "react";

const link = linkVariants();

/**
 * Synopsis clamped to four lines on phones with a "Leer más" toggle; shown
 * in full from 640px. The toggle is rendered on the server for long texts
 * (no layout shift) and hidden after mount if the text already fits.
 */
export function ExpandableSynopsis({ text }: { text: string }) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [fits, setFits] = useState(text.length < 180);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || expanded) return;
    const measure = () =>
      setFits(element.scrollHeight <= element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded]);

  return (
    <div className="mt-4">
      <p
        ref={textRef}
        id="sinopsis"
        className={`max-w-prose whitespace-pre-line text-sm leading-6 text-subtle ${expanded ? "" : "max-sm:line-clamp-4"}`}
      >
        {text}
      </p>
      {!fits && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="sinopsis"
          onClick={() => setExpanded((current) => !current)}
          className={`${link.base()} mt-2 text-sm sm:hidden`}
        >
          {expanded ? "Leer menos" : "Leer más"}
        </button>
      )}
    </div>
  );
}
