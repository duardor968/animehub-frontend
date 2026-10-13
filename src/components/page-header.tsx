import { Typography } from "@heroui/react";
import type { ReactNode } from "react";

/** Page title with an optional aside (e.g. the local clock) on its line. */
export function PageHeader({
  title,
  aside,
}: {
  title: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
      <Typography type="h1" className="min-w-0 break-words">
        {title}
      </Typography>
      {aside}
    </header>
  );
}

/** Page wrapper: shared container, skip-link target and vertical rhythm. */
export const pageMainClass =
  "page-container min-h-[70vh] pb-16 pt-10 outline-none max-sm:pb-12 max-sm:pt-8";
