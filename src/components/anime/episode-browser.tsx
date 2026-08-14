"use client";

import {
  Button,
  Card,
  Checkbox,
  NumberField,
  ProgressBar,
  Surface,
} from "@heroui/react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Minus,
  Plus,
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
  posterUrl,
  backdropUrl,
  initial,
  totalRecords,
}: {
  slug: string;
  title: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
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
    openDownload({
      slug,
      title,
      from: safeFrom,
      to: safeTo,
    });
  }

  return (
    <section id="episodios">
      <div className="flex items-end justify-between gap-6 border-b border-white/8 pb-5 max-sm:items-start max-sm:flex-col">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#69A7FF]">
            Episodios
          </span>
          <h2 className="mt-1 font-(family-name:--font-display) text-3xl font-semibold tracking-tight text-[#F3F8FC]">
            {totalRecords} disponibles
          </h2>
          <p className="mt-2 text-sm text-[#8FA3B4]">
            Selecciona episodios o envía uno directamente.
          </p>
        </div>
        <Button
          variant="secondary"
          className="h-11 rounded-full bg-[#151E2E] px-5 text-[#F3F8FC] shadow-none hover:bg-[#1C2940]"
          onPress={() => openDownload({ slug, title, all: true })}
        >
          <Download size={15} /> Serie completa
        </Button>
      </div>

      <Surface className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl bg-[#091321] px-4 py-3 shadow-none">
        <div className="mr-auto min-w-[12rem] self-center">
          <strong className="block text-sm text-[#F3F8FC]">
            Descargar un rango
          </strong>
          <span className="mt-0.5 block text-xs text-[#8FA3B4]">
            Indica el primer y el último episodio.
          </span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 max-sm:w-full">
          <EpisodeNumberField
            label="Desde"
            value={from}
            minValue={1}
            maxValue={Math.max(1, to)}
            onChange={setFrom}
          />
          <span className="pb-3 text-[#718596]">—</span>
          <EpisodeNumberField
            label="Hasta"
            value={to}
            minValue={Math.max(1, from)}
            maxValue={totalRecords}
            onChange={setTo}
          />
        </div>
        <Button
          className="h-11 rounded-full bg-[#2F81F7] px-5 font-semibold text-white shadow-none hover:bg-[#4B93F7] max-sm:w-full"
          onPress={openRange}
        >
          Descargar rango
        </Button>
      </Surface>

      {loading && (
        <ProgressBar isIndeterminate aria-label="Cargando episodios" size="sm">
          <ProgressBar.Track>
            <ProgressBar.Fill />
          </ProgressBar.Track>
        </ProgressBar>
      )}

      <div className="mt-5 flex min-h-10 items-center">
        <Checkbox
          isSelected={allVisible}
          isIndeterminate={
            !allVisible &&
            visibleNumbers.some((number) => selected.includes(number))
          }
          onChange={(isSelected) =>
            setSelected((current) =>
              isSelected
                ? Array.from(new Set([...current, ...visibleNumbers]))
                : current.filter((number) => !visibleNumbers.includes(number)),
            )
          }
          className="text-sm text-[#C4D2DE]"
        >
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Checkbox.Content>
            Seleccionar los {visibleNumbers.length} episodios de esta página
          </Checkbox.Content>
        </Checkbox>
        {selected.length > 0 && (
          <span className="ml-auto text-xs text-[#69A7FF]">
            {selected.length} seleccionado{selected.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div
        className={`mt-3 grid grid-cols-5 gap-x-4 gap-y-5 transition-opacity max-xl:grid-cols-4 max-lg:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1 ${loading ? "pointer-events-none opacity-45" : ""}`}
      >
        {episodes.map((episode) => {
          const checked = selected.includes(episode.number);
          return (
            <div
              className="group relative min-w-0 overflow-visible"
              key={episode.id}
            >
              <Card
                className={`relative min-w-0 gap-0 overflow-hidden rounded-2xl p-0 transition-[background-color,box-shadow] duration-300 group-hover:shadow-[0_18px_42px_rgba(0,0,0,.3)] ${checked ? "bg-[#111E34] shadow-[0_16px_40px_rgba(23,79,161,.18)]" : "bg-[#0A1220]"}`}
              >
                <div className="relative aspect-video overflow-hidden bg-[#0A1220] [&_.anime-image_img]:transition-transform [&_.anime-image_img]:duration-700 [&_.anime-image_img]:ease-[cubic-bezier(.22,1,.36,1)] group-hover:[&_.anime-image_img]:scale-[1.04]">
                  <AnimeImage
                    src={episode.imageUrl}
                    fallbackSrc={backdropUrl ?? posterUrl}
                    alt={`Fotograma del episodio ${episode.number}`}
                    sizes="(max-width: 680px) 90vw, (max-width: 1100px) 42vw, 18vw"
                  />
                  <div
                    className={`absolute bottom-0 left-0 flex h-7 items-center rounded-tr-lg px-3 text-[10px] font-bold ${checked ? "bg-[#111E34]" : "bg-[#0A1220]"}`}
                  >
                    <span className="tracking-[.14em] text-[#69A7FF]">EP</span>
                    <strong className="ml-1.5 tabular-nums text-[#F3F8FC]">
                      {formatEpisodeNumber(episode.number)}
                    </strong>
                  </div>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <EpisodeDownloadButton
                      slug={slug}
                      title={title}
                      episodeNumber={episode.number}
                      className="pointer-events-auto scale-90 opacity-0 transition-[opacity,transform,background-color] duration-200 group-hover:scale-100 group-hover:opacity-100 focus-visible:scale-100 focus-visible:opacity-100 [@media(hover:none)]:scale-100 [@media(hover:none)]:opacity-100"
                    />
                  </div>
                </div>
                <Card.Content className="overflow-hidden px-3.5 py-3.5">
                  <strong className="block truncate text-sm font-semibold text-[#F3F8FC]">
                    {episode.title || title}
                  </strong>
                  <time
                    className="mt-1 block text-xs text-[#8FA3B4]"
                    dateTime={episode.publishedAt ?? undefined}
                  >
                    {formatRelativeTime(episode.publishedAt)}
                  </time>
                </Card.Content>
                {checked && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-20 rounded-2xl ring-2 ring-inset ring-[#2F81F7]"
                  />
                )}
                <Button
                  isIconOnly
                  variant="secondary"
                  className={`absolute -right-px -top-px z-30 h-[54px] w-[54px] min-w-[54px] rounded-none p-0 text-[#F3F8FC] shadow-none [clip-path:polygon(0_0,100%_0,100%_100%)] transition-[opacity,transform,background-color] duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${checked ? "translate-x-0 translate-y-0 bg-[#2F81F7] opacity-100 hover:bg-[#2F81F7]" : "translate-x-[65%] -translate-y-[65%] bg-[#182235] opacity-0 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100 hover:bg-[#202D44] focus-visible:translate-x-0 focus-visible:translate-y-0 focus-visible:opacity-100 [@media(hover:none)]:translate-x-0 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100"}`}
                  aria-label={`${checked ? "Quitar" : "Seleccionar"} episodio ${episode.number}`}
                  aria-pressed={checked}
                  onPress={() => toggleEpisode(episode.number)}
                >
                  <span className="absolute right-[10px] top-[10px] grid size-4 place-items-center">
                    {checked ? (
                      <Check size={15} strokeWidth={2.8} />
                    ) : (
                      <Square size={14} />
                    )}
                  </span>
                </Button>
              </Card>
            </div>
          );
        })}
      </div>

      <div className="mt-10 flex items-center justify-center gap-3 text-sm text-[#8FA3B4]">
        <Button
          variant="ghost"
          className="rounded-lg text-[#C4D2DE] shadow-none"
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
          className="rounded-lg text-[#C4D2DE] shadow-none"
          isDisabled={page >= totalPages || loading}
          onPress={() => void changePage(page + 1)}
        >
          Siguiente <ChevronRight size={16} />
        </Button>
      </div>

      {selected.length > 0 && (
        <div
          className="fixed inset-x-1/2 bottom-5 z-40 flex w-[min(92vw,620px)] -translate-x-1/2 items-center gap-4 rounded-2xl bg-[#111A2A]/96 p-3 pl-5 shadow-[0_24px_80px_rgba(0,0,0,.62)] backdrop-blur-xl max-md:bottom-24 max-sm:gap-2 max-sm:p-2.5 max-sm:pl-3"
          role="status"
        >
          <span className="max-sm:text-xs">
            <strong>{selected.length}</strong> seleccionado
            {selected.length === 1 ? "" : "s"}
          </span>
          <Button
            className="ml-auto rounded-full bg-[#2F81F7] px-5 font-semibold text-white shadow-none hover:bg-[#4B93F7] max-sm:px-3 max-sm:text-xs"
            onPress={() =>
              openDownload({ slug, title, episodeNumbers: selected })
            }
          >
            <Download size={15} /> Descargar selección
          </Button>
          <Button
            variant="ghost"
            className="min-h-10 px-2 text-xs font-semibold text-[#8FA3B4] shadow-none hover:text-[#F3F8FC] max-sm:px-1"
            onPress={() => setSelected([])}
          >
            Limpiar
          </Button>
        </div>
      )}
    </section>
  );
}

function EpisodeNumberField({
  label,
  value,
  minValue,
  maxValue,
  onChange,
}: {
  label: string;
  value: number;
  minValue: number;
  maxValue: number;
  onChange: (value: number) => void;
}) {
  return (
    <NumberField
      aria-label={`${label} episodio`}
      value={value}
      minValue={minValue}
      maxValue={maxValue}
      onChange={onChange}
      variant="secondary"
      className="w-28 max-sm:w-full"
    >
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-[#8FA3B4]">
        {label}
      </span>
      <NumberField.Group className="h-11 rounded-xl bg-[#111A2A] shadow-none">
        <NumberField.DecrementButton
          aria-label={`Reducir ${label.toLowerCase()}`}
        >
          <Minus size={13} />
        </NumberField.DecrementButton>
        <NumberField.Input className="min-w-0 text-center text-sm tabular-nums text-[#F3F8FC]" />
        <NumberField.IncrementButton
          aria-label={`Aumentar ${label.toLowerCase()}`}
        >
          <Plus size={13} />
        </NumberField.IncrementButton>
      </NumberField.Group>
    </NumberField>
  );
}
