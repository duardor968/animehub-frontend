"use client";

import { Button } from "@heroui/react";
import { SlidersHorizontal } from "lucide-react";
import { useDownloads } from "./download-provider";

export function DownloadSettingsButton() {
  const { openSettings } = useDownloads();
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        variant="secondary"
        className="download-settings-button h-10 rounded-full bg-default px-5 text-sm font-semibold text-foreground shadow-none hover:bg-default-hover max-sm:w-11 max-sm:px-0"
        onPress={openSettings}
        aria-label="Preferencias"
      >
        <SlidersHorizontal size={17} />
        <span className="max-sm:hidden">Preferencias</span>
      </Button>
    </div>
  );
}
