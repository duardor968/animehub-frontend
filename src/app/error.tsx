"use client";

import { Button } from "@heroui/react";
import { RefreshCw } from "lucide-react";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto grid min-h-[70vh] w-full max-w-[1600px] place-items-center px-6 py-20 text-center">
      <div className="max-w-lg">
        <span className="text-[10px] font-bold uppercase tracking-[.18em] text-link">
          Error al cargar
        </span>
        <h1 className="mt-3 font-(family-name:--font-display) text-4xl font-semibold tracking-tight text-foreground">
          No se pudo cargar esta vista
        </h1>
        <p className="mt-4 text-muted">
          No pudimos completar la solicitud. Inténtalo de nuevo.
        </p>
        <Button
          className="mx-auto mt-6 h-11 rounded-xl bg-accent px-5 font-semibold text-accent-foreground shadow-none"
          onPress={reset}
        >
          <RefreshCw size={16} /> Reintentar
        </Button>
      </div>
    </main>
  );
}
