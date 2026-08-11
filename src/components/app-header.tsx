"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DownloadSettingsButton } from "./downloads/download-settings-button";
import { Brand } from "./brand";
import { SearchBox } from "./search-box";

export function AppHeader() {
  const pathname = usePathname();
  const links = [
    { href: "/", label: "Inicio" },
    { href: "/catalogo", label: "Catálogo" },
    { href: "/horario", label: "Horario" },
  ];
  return (
    <header className="app-header">
      <div className="header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="Principal">
          {links.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                href={link.href}
                key={link.href}
                aria-current={active ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="header-tools">
          <SearchBox compact />
          <DownloadSettingsButton />
        </div>
      </div>
    </header>
  );
}
