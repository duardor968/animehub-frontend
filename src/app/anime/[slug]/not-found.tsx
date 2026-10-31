import type { Metadata } from "next";
import { ButtonLink } from "@/components/button-link";
import { StatusPage } from "@/components/status-page";
import { SearchForSlug } from "./search-for-slug";

// Next already adds <meta name="robots" content="noindex"> to 404 responses.
export const metadata: Metadata = {
  title: "Anime no encontrado",
};

/** Unknown slug (the API answers 404). */
export default function AnimeNotFound() {
  return (
    <StatusPage
      title="Este anime no existe"
      description="Puede que el enlace esté mal escrito o que el anime ya no esté disponible."
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <SearchForSlug />
          <ButtonLink href="/catalogo" variant="secondary" prefetch={false}>
            Ver catálogo
          </ButtonLink>
        </div>
      }
    />
  );
}
