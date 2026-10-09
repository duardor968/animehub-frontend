import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Anime no encontrado",
  robots: { index: false, follow: true },
};

/** Unknown slug (the API answers 404): anime-specific copy and next steps. */
export default function AnimeNotFound() {
  return (
    <main
      id="contenido"
      tabIndex={-1}
      className="page-container grid min-h-[70vh] place-items-center py-20 text-center outline-none"
    >
      <div className="max-w-lg">
        <span className="eyebrow">Error 404</span>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-balance text-foreground max-sm:text-3xl">
          Este anime no existe
        </h1>
        <p className="mt-4 text-muted">
          Puede que el enlace esté mal escrito o que la fuente lo haya retirado.
          Búscalo por su nombre o explora el catálogo.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href="/buscar"
            className="inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-semibold text-accent-foreground outline-none transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Buscar anime
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
