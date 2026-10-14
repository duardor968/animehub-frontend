"use client";

import { Button, Spinner, Tooltip } from "@heroui/react";
import { Download } from "lucide-react";
import { formatEpisodeNumber } from "@/lib/format";
import { activeStatuses } from "./download-activity";
import { useDownloads } from "./download-provider";
import { EpisodeCopyMenu } from "./episode-copy-menu";

/** An episode's own download button: a copy menu when links go to the
 *  clipboard, otherwise a download to the chosen destination. The tooltip
 *  says the action; the accessible name adds the episode and, among several
 *  series (`withSeries`), the anime. */
export function EpisodeDownloadButton({
  slug,
  title,
  episodeNumber,
  withSeries = true,
  className = "",
}: {
  slug: string;
  title: string;
  episodeNumber: number;
  withSeries?: boolean;
  className?: string;
}) {
  const { deviceProfile, destination, getRequestStatus, openDownload } =
    useDownloads();
  const portable = deviceProfile === "portable";
  if (destination === "COPY")
    return (
      <EpisodeCopyMenu
        slug={slug}
        title={title}
        episodeNumber={episodeNumber}
        withSeries={withSeries}
        className={className}
        portable={portable}
      />
    );

  const request = { slug, title, episodeNumbers: [episodeNumber] };
  const status = getRequestStatus(request);
  const pending = status !== undefined && activeStatuses.has(status);
  const label = `Descargar el episodio ${formatEpisodeNumber(episodeNumber)}${withSeries ? ` de ${title}` : ""}`;
  const button = (
    <Button
      isIconOnly
      aria-label={label}
      isPending={pending}
      // Visible while pending where it otherwise shows only on hover.
      className={`${className} episode-action ${pending ? "!scale-100 !opacity-100" : ""}`}
      onPress={() => openDownload(request)}
    >
      {pending ? (
        <Spinner color="current" size="sm" aria-label="Preparando descarga" />
      ) : (
        <Download aria-hidden="true" />
      )}
    </Button>
  );
  if (portable) return button;
  return (
    <Tooltip delay={300}>
      {button}
      <Tooltip.Content>Descargar</Tooltip.Content>
    </Tooltip>
  );
}
