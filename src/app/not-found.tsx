import type { Metadata } from "next";
import { ButtonLink } from "@/components/button-link";
import { StatusPage } from "@/components/status-page";

// Next already adds <meta name="robots" content="noindex"> to 404 responses.
export const metadata: Metadata = {
  title: "Página no encontrada",
};

export default function NotFound() {
  return (
    <StatusPage
      title="Esta página no existe"
      description="Puede que el enlace esté mal escrito o que la página ya no esté disponible."
      action={<ButtonLink href="/">Ir al inicio</ButtonLink>}
    />
  );
}
