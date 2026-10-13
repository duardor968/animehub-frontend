import type { Metadata } from "next";
import { ButtonLink } from "@/components/button-link";
import { StatusPage } from "@/components/status-page";

// Next already adds <meta name="robots" content="noindex"> to 404 responses.
export const metadata: Metadata = {
  title: "Anime no encontrado",
};

/** Unknown slug (the API answers 404). */
export default function AnimeNotFound() {
  return (
    <StatusPage
      title="Este anime no existe"
      description="Puede que el enlace esté mal escrito o que la fuente lo haya retirado."
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink href="/buscar" prefetch={false}>
            Buscar anime
          </ButtonLink>
          <ButtonLink href="/catalogo" variant="secondary" prefetch={false}>
            Ver el catálogo
          </ButtonLink>
        </div>
      }
    />
  );
}
