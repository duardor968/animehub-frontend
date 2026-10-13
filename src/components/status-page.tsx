import type { ReactNode } from "react";
import { MAIN_CONTENT_ID } from "@/lib/navigation";
import { pageMainClass } from "./page-header";
import { EmptyState } from "./empty-state";

/** A page that is only a state (404, error, unavailable content). */
export function StatusPage({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action: ReactNode;
}) {
  return (
    <main
      id={MAIN_CONTENT_ID}
      tabIndex={-1}
      className={`${pageMainClass} grid place-items-center`}
    >
      <EmptyState
        level={1}
        title={title}
        description={description}
        action={action}
      />
    </main>
  );
}
