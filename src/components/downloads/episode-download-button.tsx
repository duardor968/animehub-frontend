"use client";

import { Button, Spinner, Tooltip } from "@heroui/react";
import { Copy, Download } from "lucide-react";
import { formatEpisodeNumber } from "@/lib/format";
import { activeStatuses } from "./download-activity";
import { useDownloads } from "./download-provider";
import { EpisodeCopyMenu } from "./episode-copy-menu";

/** An episode's own download button: a copy menu when links go to the
 *  clipboard from several servers, otherwise a download to the chosen
 *  destination (a plain copy with one server, which the menu would only
 *  repeat). The tooltip says the action; the accessible name adds the
 *  episode and, among several series (`withSeries`), the anime. */
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
  const {
    deviceProfile,
    destination,
    preferences,
    getRequestStatus,
    openDownload,
  } = useDownloads();
  const portable = deviceProfile === "portable";
  const copying = destination === "COPY";
  if (copying && preferences.providers.length > 1)
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
  const label = `${copying ? "Copiar enlaces del" : "Descargar el"} episodio ${formatEpisodeNumber(episodeNumber)}${withSeries ? ` de ${title}` : ""}`;
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
        <Spinner
          color="current"
          size="sm"
          aria-label={copying ? "Buscando enlaces" : "Preparando descarga"}
        />
      ) : copying ? (
        <Copy aria-hidden="true" />
      ) : (
        <Download aria-hidden="true" />
      )}
    </Button>
  );
  if (portable) return button;
  return (
    <Tooltip delay={300}>
      {button}
      <Tooltip.Content>
        {copying ? "Copiar enlaces" : "Descargar"}
      </Tooltip.Content>
    </Tooltip>
  );
}
