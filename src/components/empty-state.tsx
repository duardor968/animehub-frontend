import { Typography } from "@heroui/react";
import type { ReactNode } from "react";

/** Empty or unavailable content: what happened and the way out. */
export function EmptyState({
  title,
  description,
  action,
  level = 3,
}: {
  title: string;
  description?: string;
  /** A ButtonLink or Button. */
  action?: ReactNode;
  /** 1 when the state is the whole page (StatusPage). */
  level?: 1 | 3;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-2 py-12 text-center">
      <Typography type={`h${level}`} align="center">
        {title}
      </Typography>
      {description ? (
        <p className="max-w-md text-sm text-balance text-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
