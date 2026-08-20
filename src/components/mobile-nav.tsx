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
    <nav
      className="mobile-nav fixed inset-x-3 bottom-3 z-50 hidden h-16 grid-cols-4 rounded-[1.35rem] bg-[#111A2A]/96 p-1.5 shadow-[0_22px_64px_rgba(0,0,0,.55)] backdrop-blur-xl max-[800px]:grid"
      aria-label="Principal móvil"
    >
      {links.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            href={href}
            key={href}
            aria-current={active ? "page" : undefined}
            className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-semibold text-[#93A4B8] transition-colors hover:text-[#F3F8FC] aria-[current=page]:bg-[#2F81F7] aria-[current=page]:text-white focus-visible:outline-2 focus-visible:outline-[#7CB0FF]"
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
