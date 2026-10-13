"use client";

import { buttonVariants } from "@heroui/styles";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { DownloadSettingsButton } from "./downloads/download-settings-button";
import { Brand } from "./brand";
import { SearchBox } from "./search-box";
import { isActiveLink, MAIN_CONTENT_ID, primaryLinks } from "@/lib/navigation";

export function SkipLink() {
  const skip = (event: MouseEvent<HTMLAnchorElement>) => {
    // Works even on a page whose <main> lacks the id: fall back to the first
    // <main>, and make it focusable so the next Tab continues from there.
    const target =
      document.getElementById(MAIN_CONTENT_ID) ??
      document.querySelector("main");
    if (!(target instanceof HTMLElement)) return;
    event.preventDefault();
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start" });
  };
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      onClick={skip}
      // Above the viewport until it gets keyboard focus.
      className={buttonVariants({
        className:
          "fixed left-4 top-3 z-60 -translate-y-20 focus:translate-y-0",
      })}
    >
      Saltar al contenido
    </a>
  );
}

export function AppHeader() {
  const pathname = usePathname();
  // /buscar has its own search field (synced with the URL); a second one in
  // the header would only compete with it.
  const showSearch = pathname !== "/buscar";
  return (
    <header className="sticky top-0 z-50 border-b border-separator bg-background/90 backdrop-blur-xl">
      <div className="page-container flex h-(--header-height) items-center gap-6 max-lg:gap-3">
        <Brand />
        {showSearch ? <SearchBox compact /> : null}
        <div className="ml-auto flex h-full items-center gap-1">
          <nav
            className="flex h-full items-center gap-1 max-lg:hidden"
            aria-label="Principal"
          >
            {primaryLinks.map((link) => (
              <Link
                href={link.href}
                key={link.href}
                aria-current={
                  isActiveLink(pathname, link.href) ? "page" : undefined
                }
                className="relative grid h-11 place-items-center rounded-lg px-4 text-sm font-medium text-muted outline-none transition-colors hover:text-foreground focus-visible:status-focused aria-[current=page]:text-foreground aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-4 aria-[current=page]:after:-bottom-2.5 aria-[current=page]:after:h-0.5 aria-[current=page]:after:rounded-full aria-[current=page]:after:bg-brand"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <DownloadSettingsButton />
        </div>
      </div>
    </header>
  );
}
