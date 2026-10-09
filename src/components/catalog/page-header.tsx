import type { ReactNode } from "react";

/**
 * Shared header for the Catálogo, Buscar and Horario pages: eyebrow, title and
 * a static description, with an optional aside (e.g. the local clock).
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 max-w-2xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 break-words font-display text-5xl font-semibold tracking-[-.04em] text-foreground max-sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">{description}</p>
      </div>
      {aside}
    </header>
  );
}

/** Page wrapper: shared container, skip-link target and vertical rhythm. */
export const pageMainClass =
  "page-container min-h-[70vh] pb-16 pt-12 outline-none max-sm:pt-9";
