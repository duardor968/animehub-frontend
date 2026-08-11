"use client";

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
  const { openDownload } = useDownloads();
  return (
    <button
      className={`episode-download ${className}`}
      aria-label={`Descargar episodio ${episodeNumber} de ${title}`}
      title="Descargar episodio"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openDownload({ slug, title, episodeNumbers: [episodeNumber] });
      }}
    >
      <Download aria-hidden="true" size={18} />
    </button>
  );
}
