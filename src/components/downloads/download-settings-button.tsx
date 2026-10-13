"use client";

import { Button, Tooltip } from "@heroui/react";
import { SlidersHorizontal } from "lucide-react";
import { preloadDownloadDrawer, useDownloads } from "./download-provider";

const label = "Preferencias de descarga";

/** Header button for the download preferences drawer: with its text from xl,
 *  icon-only below so the header search keeps its width. */
export function DownloadSettingsButton() {
  const { openSettings } = useDownloads();
  const actions = {
    // 40 px from md, as tall as the header search.
    size: "lg",
    variant: "secondary",
    "aria-label": label,
    onPress: openSettings,
    onHoverStart: preloadDownloadDrawer,
    onFocus: preloadDownloadDrawer,
  } as const;
  return (
    <>
      <Button {...actions} className="max-xl:hidden">
        <SlidersHorizontal aria-hidden="true" />
        Preferencias
      </Button>
      <Tooltip delay={300}>
        <Button {...actions} isIconOnly className="xl:hidden">
          <SlidersHorizontal aria-hidden="true" />
        </Button>
        <Tooltip.Content>{label}</Tooltip.Content>
      </Tooltip>
    </>
  );
}
