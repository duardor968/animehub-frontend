"use client";

import { CalendarDays, Home, Layers3, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/catalogo", label: "Catálogo", icon: Layers3 },
  { href: "/horario", label: "Horario", icon: CalendarDays },
  { href: "/buscar", label: "Buscar", icon: Search },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="mobile-nav" aria-label="Principal móvil">
      {links.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            href={href}
            key={href}
            aria-current={active ? "page" : undefined}
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
