"use client";

import { Button } from "@heroui/react";
import { SlidersHorizontal } from "lucide-react";
import { preloadDownloadDrawer, useDownloads } from "./download-provider";

/** Header button for the download preferences drawer. Icon-only below xl so
 *  the header search keeps its width; the accessible name always includes
 *  the visible "Preferencias" text. */
export function DownloadSettingsButton({
  className = "",
}: {
  className?: string;
}) {
  const { openSettings } = useDownloads();
  return (
    <Button
      variant="secondary"
      className={`download-settings-button h-11 shrink-0 rounded-full bg-default px-5 text-sm font-semibold text-foreground shadow-none outline-none hover:bg-default-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background max-xl:w-11 max-xl:min-w-11 max-xl:px-0 ${className}`}
      onPress={openSettings}
      onHoverStart={preloadDownloadDrawer}
      onFocus={preloadDownloadDrawer}
      aria-label="Preferencias de descarga"
    >
      <SlidersHorizontal size={17} aria-hidden="true" />
      <span className="max-xl:hidden">Preferencias</span>
    </Button>
  );
}
