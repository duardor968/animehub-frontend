"use client";

import { SlidersHorizontal } from "lucide-react";
import { useDownloads } from "./download-provider";

export function DownloadSettingsButton() {
  const { openSettings } = useDownloads();
  return (
    <button
      className="icon-button"
      onClick={openSettings}
      aria-label="Preferencias de descarga"
      title="Preferencias de descarga"
    >
      <SlidersHorizontal size={17} />
    </button>
  );
}
