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
  const { getEpisodeStatus, openDownload } = useDownloads();
  const status = getEpisodeStatus(slug, episodeNumber);
  const pending = ["resolving", "processing", "sending"].includes(status ?? "");
  return (
    <Tooltip delay={300}>
      <Button
        isIconOnly
        variant="ghost"
        className={`h-11 w-11 min-w-11 rounded-full bg-[#2F81F7] text-white shadow-[0_12px_34px_rgba(47,129,247,.32)] hover:bg-[#4B93F7] active:scale-95 ${className}`}
        aria-label={`Descargar episodio ${episodeNumber} de ${title}`}
        aria-busy={pending}
        isDisabled={pending}
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
      <Tooltip.Content className="bg-[#182235] px-2.5 py-1 text-xs text-[#F3F8FC]">
        Descargar episodio
      </Tooltip.Content>
    </Tooltip>
  );
}
