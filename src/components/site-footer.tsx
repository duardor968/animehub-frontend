"use client";

import { Link, Separator, Tooltip } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { BrandLockup } from "./brand";
import { GithubMark } from "./brand-icons";

const sourceCodeUrl = "https://github.com/duardor968/animehub-frontend";
const sourceCodeLabel = "Código fuente en GitHub";

export function SiteFooter() {
  return (
    // The bottom padding clears the fixed mobile navigation (0 at ≥1024px)
    // and the download dock while it is shown.
    <footer className="site-footer pb-[calc(var(--bottom-nav-clearance)+var(--download-dock-height,0px))]">
      <div className="page-container">
        <Separator />
        <div className="flex h-16 items-center justify-between">
          <BrandLockup className="opacity-60" />
          <Tooltip delay={300}>
            <Link
              href={sourceCodeUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={sourceCodeLabel}
              // The glyph, not the button, lines up with the container edge.
              className={buttonVariants({
                variant: "ghost",
                isIconOnly: true,
                className: "-mr-2",
              })}
            >
              <GithubMark className="size-5" />
            </Link>
            <Tooltip.Content>{sourceCodeLabel}</Tooltip.Content>
          </Tooltip>
        </div>
      </div>
    </footer>
  );
}
