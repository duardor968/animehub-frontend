"use client";

import { CalendarDays, Home, Layers3, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActiveLink, siteLinks } from "@/lib/navigation";

const icons = {
  "/": Home,
  "/catalogo": Layers3,
  "/horario": CalendarDays,
  "/buscar": Search,
} as const;

// Below lg only. Height (4rem) + bottom gap (0.75rem) + safe area must stay in
// sync with --bottom-nav-clearance in globals.css.
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-50 mx-auto hidden h-16 max-w-md grid-cols-4 gap-1 rounded-[1.35rem] bg-surface-secondary/96 p-1.5 shadow-[0_22px_64px_rgba(0,0,0,.55)] backdrop-blur-xl max-lg:grid [html[data-device=portable]_&]:bg-surface-secondary/98 [html[data-device=portable]_&]:backdrop-blur-none"
      aria-label="Principal móvil"
    >
      {siteLinks.map(({ href, label }) => {
        const Icon = icons[href];
        const active = isActiveLink(pathname, href);
        return (
          <Link
            href={href}
            key={href}
            aria-current={active ? "page" : undefined}
            className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-secondary aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
          >
            <Icon
              aria-hidden="true"
              size={20}
              strokeWidth={active ? 2.3 : 1.7}
            />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
