"use client";

import { useEffect } from "react";
import { RetryButton } from "@/components/retry-button";
import { StatusPage } from "@/components/status-page";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error.digest ? `Error ${error.digest}` : error);
  }, [error]);

  return (
    <>
      <title>Error al cargar · AnimeHub</title>
      <StatusPage
        title="No se pudo cargar esta página"
        action={<RetryButton onRetry={retry} />}
      />
    </>
  );
}
