/** Primary sections shown in the desktop header. */
export const primaryLinks = [
  { href: "/", label: "Inicio" },
  { href: "/catalogo", label: "Catálogo" },
  { href: "/horario", label: "Horario" },
] as const;

/** Sections listed in the mobile navigation and the footer. */
export const siteLinks = [
  ...primaryLinks,
  { href: "/buscar", label: "Buscar" },
] as const;

export function isActiveLink(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

/** Id of every page's main content: the skip link's target. */
export const MAIN_CONTENT_ID = "contenido";
