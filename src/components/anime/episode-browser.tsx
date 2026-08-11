"use client";

import { CheckSquare, Download, Square } from "lucide-react";
import { useState } from "react";
import {
  apiFetch,
  type Episode,
  type EpisodePageResponse,
} from "@/lib/api/client";
import { useDownloads } from "../downloads/download-provider";
import { EpisodeDownloadButton } from "../downloads/episode-download-button";

export function EpisodeBrowser({
  slug,
  title,
  initial,
  totalRecords,
}: {
  slug: string;
  title: string;
  initial: Episode[];
  totalRecords: number;
}) {
  const { openDownload } = useDownloads();
  const [episodes, setEpisodes] = useState(initial);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(Math.min(50, totalRecords));
  const totalPages = Math.ceil(totalRecords / 50);
  async function changePage(nextPage: number) {
    setLoading(true);
    try {
      const response = await apiFetch<EpisodePageResponse>(
        `/anime/${encodeURIComponent(slug)}/episodes?page=${nextPage}`,
        {},
        true,
      );
      setEpisodes(response.data);
      setPage(nextPage);
      setSelected([]);
    } finally {
      setLoading(false);
    }
  }
  const visibleNumbers = episodes.map((episode) => episode.number);
  const allVisible = visibleNumbers.every((number) =>
    selected.includes(number),
  );
  return (
    <section className="episodes-section" id="episodios">
      <div className="episode-toolbar">
        <div>
          <span className="eyebrow">Episodios</span>
          <h2>{totalRecords} disponibles</h2>
        </div>
        <button
          className="secondary-button"
          onClick={() => openDownload({ slug, title, all: true })}
        >
          <Download size={15} /> Serie completa
        </button>
      </div>
      <div className="range-tools">
        <button onClick={() => setSelected(allVisible ? [] : visibleNumbers)}>
          {allVisible ? <CheckSquare size={16} /> : <Square size={16} />}
          {allVisible ? "Quitar página" : "Seleccionar página"}
        </button>
        <div className="custom-range">
          <span>Rango</span>
          <input
            aria-label="Desde episodio"
            type="number"
            min={0}
            max={totalRecords}
            value={from}
            onChange={(event) => setFrom(Number(event.target.value))}
          />
          <span>—</span>
          <input
            aria-label="Hasta episodio"
            type="number"
            min={from}
            max={totalRecords}
            value={to}
            onChange={(event) => setTo(Number(event.target.value))}
          />
          <button
            onClick={() => {
              const count = Math.max(0, to - from + 1);
              openDownload({
                slug,
                title,
                episodeNumbers:
                  count <= 50
                    ? Array.from({ length: count }, (_, index) => from + index)
                    : undefined,
                from,
                to,
              });
            }}
          >
            Preparar
          </button>
        </div>
      </div>
      <div className={loading ? "episode-list loading" : "episode-list"}>
        {episodes.map((episode) => {
          const checked = selected.includes(episode.number);
          return (
            <div className="episode-row" key={episode.id}>
              <button
                className="episode-select"
                aria-pressed={checked}
                onClick={() =>
                  setSelected(
                    checked
                      ? selected.filter((number) => number !== episode.number)
                      : [...selected, episode.number],
                  )
                }
              >
                {checked ? <CheckSquare size={17} /> : <Square size={17} />}
                <span>Episodio {episode.number}</span>
              </button>
              {episode.title && <small>{episode.title}</small>}
              <EpisodeDownloadButton
                slug={slug}
                title={title}
                episodeNumber={episode.number}
              />
            </div>
          );
        })}
      </div>
      <div className="episode-footer">
        <button
          disabled={page <= 1 || loading}
          onClick={() => void changePage(page - 1)}
        >
          Anterior
        </button>
        <span>
          {page} / {totalPages}
        </span>
        <button
          disabled={page >= totalPages || loading}
          onClick={() => void changePage(page + 1)}
        >
          Siguiente
        </button>
      </div>
      {selected.length > 0 && (
        <div className="selection-tray">
          <span>{selected.length} seleccionados</span>
          <button
            className="primary-button"
            onClick={() =>
              openDownload({ slug, title, episodeNumbers: selected })
            }
          >
            <Download size={15} /> Preparar
          </button>
        </div>
      )}
    </section>
  );
}
