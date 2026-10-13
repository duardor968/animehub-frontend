"use client";

import { Button, Spinner } from "@heroui/react";
import { RotateCw } from "lucide-react";
import { useTransition } from "react";

/** Retries a failed load; pending until the new attempt settles. */
export function RetryButton({
  onRetry,
  variant,
}: {
  onRetry: () => void | Promise<void>;
  variant?: "primary" | "secondary";
}) {
  const [pending, startRetry] = useTransition();
  return (
    <Button
      variant={variant}
      isPending={pending}
      onPress={() => startRetry(onRetry)}
    >
      {pending ? (
        <Spinner color="current" size="sm" aria-hidden="true" />
      ) : (
        <RotateCw aria-hidden="true" />
      )}
      Reintentar
    </Button>
  );
}
