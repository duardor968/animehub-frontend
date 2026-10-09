"use client";

import { Button, ProgressCircle, Tooltip } from "@heroui/react";
import { Download } from "lucide-react";
import { useDownloads } from "./download-provider";

export function EpisodeDownloadButton({
  slug,
  title,
  episodeNumber,
  className = "",
}: {
  slug: string;
  title: string;
  episodeNumber: number;
  className?: string;
}) {
  const { deviceProfile, getEpisodeStatus, openDownload } = useDownloads();
  const status = getEpisodeStatus(slug, episodeNumber);
  const pending = ["resolving", "processing", "sending"].includes(status ?? "");
  const button = (
    <Button
      isIconOnly
      variant="ghost"
      // Pending keeps the button visible even where it normally appears on
      // hover. `scale` (not `transform`) is what Tailwind's scale-* sets.
      className={`episode-download-action h-11 w-11 min-w-11 rounded-full bg-accent text-accent-foreground shadow-[0_12px_34px_rgb(31_111_235/0.32)] outline-none hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95 ${className} ${pending ? "!scale-100 !opacity-100" : ""}`}
      aria-label={`Descargar episodio ${episodeNumber} de ${title}`}
      isPending={pending}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openDownload({ slug, title, episodeNumbers: [episodeNumber] });
      }}
    >
      {pending ? (
        <ProgressCircle
          isIndeterminate
          size="sm"
          color="default"
          aria-label="Preparando descarga"
          className="size-5 text-white"
        >
          <ProgressCircle.Track className="size-5">
            <ProgressCircle.TrackCircle className="stroke-white/25" />
            <ProgressCircle.FillCircle className="stroke-white" />
          </ProgressCircle.Track>
        </ProgressCircle>
      ) : (
        <Download aria-hidden="true" size={18} />
      )}
    </Button>
  );
  if (deviceProfile === "portable") return button;
  return (
    <Tooltip delay={300}>
      {button}
      <Tooltip.Content className="bg-surface-tertiary px-2.5 py-1 text-xs text-foreground">
        Descargar episodio
      </Tooltip.Content>
    </Tooltip>
  );
}
