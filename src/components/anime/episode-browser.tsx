"use client";

import { Button, ProgressBar } from "@heroui/react";
import {
  Check,
  CheckSquare2,
  ChevronLeft,
  ChevronRight,
  Download,
  Square,
} from "lucide-react";
import { useState } from "react";
import {
  apiFetch,
  type Episode,
  type EpisodePageResponse,
} from "@/lib/api/client";
import { formatEpisodeNumber, formatRelativeTime } from "@/lib/format";
import { AnimeImage } from "../anime-image";
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
  const totalPages = Math.max(1, Math.ceil(totalRecords / 50));

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
      document
        .querySelector("#episodios")
        ?.scrollIntoView({ behavior: "smooth" });
    } finally {
      setLoading(false);
    }
  }

  const visibleNumbers = episodes.map((episode) => episode.number);
  const allVisible =
    visibleNumbers.length > 0 &&
    visibleNumbers.every((number) => selected.includes(number));

  function toggleEpisode(number: number) {
    setSelected((current) =>
      current.includes(number)
        ? current.filter((entry) => entry !== number)
        : [...current, number],
    );
  }

  function openRange() {
    const safeFrom = Math.max(1, Math.min(from, to));
    const safeTo = Math.max(safeFrom, Math.min(to, totalRecords));
    const count = safeTo - safeFrom + 1;
    openDownload({
      slug,
      title,
      episodeNumbers:
        count <= 50
          ? Array.from({ length: count }, (_, index) => safeFrom + index)
          : undefined,
      from: safeFrom,
      to: safeTo,
    });
  }

  return (
    <section className="episodes-section" id="episodios">
      <div className="episode-toolbar">
        <div>
          <span className="eyebrow">Episodios</span>
          <h2>{totalRecords} disponibles</h2>
          <p>Selecciona episodios o envía uno directamente a tu destino.</p>
        </div>
        <Button
          className="secondary-button"
          onPress={() => openDownload({ slug, title, all: true })}
        >
          <Download size={15} /> Serie completa
        </Button>
      </div>

      <div className="episode-actions">
        <button
          className="select-page"
          onClick={() => setSelected(allVisible ? [] : visibleNumbers)}
        >
          {allVisible ? <CheckSquare2 size={17} /> : <Square size={17} />}
          {allVisible ? "Quitar selección" : "Seleccionar esta página"}
        </button>
        <div className="range-tools">
          <span>Rango</span>
          <label>
            <span className="sr-only">Desde episodio</span>
            <input
              aria-label="Desde episodio"
              type="number"
              min={1}
              max={totalRecords}
              value={from}
              onChange={(event) => setFrom(Number(event.target.value))}
            />
          </label>
          <i>—</i>
          <label>
            <span className="sr-only">Hasta episodio</span>
            <input
              aria-label="Hasta episodio"
              type="number"
              min={from}
              max={totalRecords}
              value={to}
              onChange={(event) => setTo(Number(event.target.value))}
            />
          </label>
          <Button className="range-submit" onPress={openRange}>
            Descargar rango
          </Button>
        </div>
      </div>

      {loading && (
        <ProgressBar isIndeterminate aria-label="Cargando episodios" size="sm">
          <ProgressBar.Track>
            <ProgressBar.Fill />
          </ProgressBar.Track>
        </ProgressBar>
      )}

      <div className={loading ? "episode-grid loading" : "episode-grid"}>
        {episodes.map((episode) => {
          const checked = selected.includes(episode.number);
          return (
            <article
              className={checked ? "episode-card selected" : "episode-card"}
              key={episode.id}
            >
              <button
                className="episode-check"
                aria-label={`${checked ? "Quitar" : "Seleccionar"} episodio ${episode.number}`}
                aria-pressed={checked}
                onClick={() => toggleEpisode(episode.number)}
              >
                {checked ? <Check size={15} /> : <Square size={15} />}
              </button>
              <div className="episode-image">
                <AnimeImage
                  src={episode.imageUrl}
                  alt={`Fotograma del episodio ${episode.number}`}
                  sizes="(max-width: 680px) 90vw, (max-width: 1100px) 42vw, 18vw"
                />
                <div className="episode-image-shade" />
                <div className="episode-badge">
                  <span>EP</span>
                  <strong>{formatEpisodeNumber(episode.number)}</strong>
                </div>
                <EpisodeDownloadButton
                  slug={slug}
                  title={title}
                  episodeNumber={episode.number}
                />
              </div>
              <div className="episode-meta">
                <strong>
                  {episode.title ||
                    `Episodio ${formatEpisodeNumber(episode.number)}`}
                </strong>
                <time dateTime={episode.publishedAt ?? undefined}>
                  {formatRelativeTime(episode.publishedAt)}
                </time>
              </div>
            </article>
          );
        })}
      </div>

      <div className="episode-footer">
        <Button
          variant="ghost"
          isDisabled={page <= 1 || loading}
          onPress={() => void changePage(page - 1)}
        >
          <ChevronLeft size={16} /> Anterior
        </Button>
        <span>
          Página {page} de {totalPages}
        </span>
        <Button
          variant="ghost"
          isDisabled={page >= totalPages || loading}
          onPress={() => void changePage(page + 1)}
        >
          Siguiente <ChevronRight size={16} />
        </Button>
      </div>

      {selected.length > 0 && (
        <div className="selection-tray" role="status">
          <span>
            <strong>{selected.length}</strong> seleccionados
          </span>
          <Button
            className="primary-button"
            onPress={() =>
              openDownload({ slug, title, episodeNumbers: selected })
            }
          >
            <Download size={15} /> Descargar selección
          </Button>
        </div>
      )}
    </section>
  );
}
