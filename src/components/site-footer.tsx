import Link from "next/link";
import { siteLinks } from "@/lib/navigation";
import { BrandLockup } from "./brand";

const sourceCodeUrl = "https://github.com/duardor968/animehub-frontend";

const linkClass =
  "inline-flex min-h-11 items-center rounded-md text-sm text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function SiteFooter() {
  return (
    // The bottom padding clears the fixed mobile navigation (0 at ≥1024px).
    <footer className="border-t border-border pt-8 pb-[calc(var(--bottom-nav-clearance)+2rem)]">
      <div className="page-container flex flex-wrap items-start justify-between gap-x-12 gap-y-6">
        <div className="max-w-sm">
          <BrandLockup className="opacity-90" />
          <p className="mt-3 text-sm leading-6 text-muted">
            AnimeHub no aloja archivos. Datos y enlaces de AnimeAV1.
          </p>
        </div>
        <nav aria-label="Secciones">
          <ul className="flex flex-wrap gap-x-6">
            {siteLinks.map((link) => (
              <li key={link.href}>
                <Link className={linkClass} href={link.href}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <a
          className={linkClass}
          href={sourceCodeUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Código abierto (AGPL-3.0)
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </a>
      </div>
    </footer>
  );
}
