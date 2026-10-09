import type { Metadata } from "next";
import Link from "next/link";
import { MAIN_CONTENT_ID } from "@/lib/navigation";

// Next already adds <meta name="robots" content="noindex"> to 404 responses.
export const metadata: Metadata = {
  title: "Página no encontrada",
};

export default function NotFound() {
  return (
    <main
      id={MAIN_CONTENT_ID}
      tabIndex={-1}
      className="page-container grid min-h-[70vh] place-items-center py-20 text-center outline-none"
    >
      <div className="max-w-lg">
        <span className="eyebrow">Error 404</span>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-balance text-foreground max-sm:text-3xl">
          Esta página no existe
        </h1>
        <p className="mt-4 text-muted">
          Puede que el enlace esté mal escrito o que la página ya no esté
          disponible.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-semibold text-accent-foreground outline-none transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Ir al inicio
          </Link>
          <Link
            href="/catalogo"
            className="inline-flex h-11 items-center rounded-full bg-default px-6 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-default-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Explorar el catálogo
          </Link>
        </div>
      </div>
    </main>
  );
}
