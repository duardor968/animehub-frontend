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
    <header className="sticky top-0 z-50 bg-[#030711]/90 shadow-[0_1px_0_rgba(255,255,255,.055)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-8 px-6 max-lg:gap-5 max-sm:h-14 max-sm:px-4">
        <Brand />
        <nav
          className="flex h-full items-center gap-1 max-[800px]:hidden"
          aria-label="Principal"
        >
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
                className="relative grid h-full place-items-center px-4 text-sm font-medium text-[#93A4B8] transition-colors hover:text-[#F3F8FC] aria-[current=page]:text-[#F3F8FC] aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-4 aria-[current=page]:after:bottom-0 aria-[current=page]:after:h-0.5 aria-[current=page]:after:bg-[#2F81F7]"
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3">
          <SearchBox compact />
          <DownloadSettingsButton />
        </div>
      </div>
    </header>
  );
}
