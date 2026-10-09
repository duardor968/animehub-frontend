"use client";

import { Button } from "@heroui/react";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { MAIN_CONTENT_ID } from "@/lib/navigation";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();

  useEffect(() => {
    console.error(error.digest ? `Error ${error.digest}` : error);
  }, [error]);

  // reset() alone only re-renders the boundary with the same failed server
  // payload; refresh() refetches the route so a recovered API shows content.
  const retry = () =>
    startRetry(() => {
      router.refresh();
      reset();
    });

  return (
    <main
      id={MAIN_CONTENT_ID}
      tabIndex={-1}
      className="page-container grid min-h-[70vh] place-items-center py-20 text-center outline-none"
    >
      <title>Error al cargar · AnimeHub</title>
      <div className="max-w-lg">
        <span className="eyebrow">Error al cargar</span>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-balance text-foreground max-sm:text-3xl">
          No se pudo cargar esta vista
        </h1>
        <p className="mt-4 text-muted">
          No pudimos completar la solicitud. Inténtalo de nuevo en unos
          segundos.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button
            className="h-11 rounded-full bg-accent px-6 font-semibold text-accent-foreground shadow-none hover:bg-accent-hover"
            isPending={retrying}
            onPress={retry}
          >
            <RefreshCw
              aria-hidden="true"
              size={16}
              className={
                retrying ? "animate-spin motion-reduce:animate-none" : ""
              }
            />
            {retrying ? "Reintentando…" : "Reintentar"}
          </Button>
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-full bg-default px-6 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-default-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
