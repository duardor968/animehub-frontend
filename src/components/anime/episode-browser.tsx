"use client";

import {
  Button,
  Card,
  Checkbox,
  Pagination,
  ProgressBar,
  Surface,
} from "@heroui/react";
import { Check, Download, Minus, Plus, Square } from "lucide-react";
import { useState, type Dispatch, type SetStateAction } from "react";
import {
  apiFetch,
  type Episode,
  type EpisodePageResponse,
} from "@/lib/api/client";
import { formatEpisodeNumber } from "@/lib/format";
import { AnimeImage } from "../anime-image";
import { useDownloads } from "../downloads/download-provider";
import { EpisodeDownloadButton } from "../downloads/episode-download-button";

const PAGE_SIZE = 50;

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
  const [to, setTo] = useState(Math.min(PAGE_SIZE, totalRecords));
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));

  async function changePage(nextPage: number) {
    const target = Math.max(1, Math.min(nextPage, totalPages));
    if (target === page || loading) return;
    setLoading(true);
    try {
      const response = await apiFetch<EpisodePageResponse>(
        `/anime/${encodeURIComponent(slug)}/episodes?page=${target}`,
        {},
        true,
      );
      setEpisodes(response.data);
      setPage(target);
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
          <Download size={15} /> Descargar todo
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
            setValue={setFrom}
            max={totalRecords}
          />
          <span className="pb-3 text-[#718596]">—</span>
          <EpisodeNumberField
            label="Hasta"
            value={to}
            setValue={setTo}
            max={totalRecords}
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

      <div className="mt-5 flex min-h-10 items-center gap-2.5">
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
          <Checkbox.Content className="gap-2.5">
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            Seleccionar todo
          </Checkbox.Content>
        </Checkbox>
        <span className="text-xs text-[#718596] max-sm:hidden">
          {visibleNumbers.length} episodios en esta página
        </span>
        {selected.length > 0 && (
          <span className="ml-auto text-xs text-[#69A7FF]">
            {selected.length} seleccionado{selected.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {totalPages > 1 && (
        <EpisodePager
          page={page}
          totalPages={totalPages}
          totalRecords={totalRecords}
          loading={loading}
          onPage={changePage}
          className="mt-4"
        />
      )}

      <div
        className={`mt-4 grid grid-cols-5 gap-x-4 gap-y-5 transition-opacity max-xl:grid-cols-4 max-lg:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1 ${loading ? "pointer-events-none opacity-45" : ""}`}
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
                {/* Corner selector lives inside the card and OVERSHOOTS the top/right
                    edges by 2px. The card's overflow-hidden clips the overshoot, so the
                    triangle's SOLID body (not its anti-aliased edge) covers the card's
                    top row — under fractional DPR (e.g. 125%) that top edge is soft, so
                    without the overshoot the image bled through ~1px. Overshooting hides
                    it: the card can never show through the solid triangle. */}
                <Checkbox
                  isSelected={checked}
                  onChange={() => toggleEpisode(episode.number)}
                  aria-label={`${checked ? "Quitar" : "Seleccionar"} episodio ${episode.number}`}
                  className={`pointer-events-auto absolute right-[-2px] top-[-2px] z-30 block h-[54px] w-[54px] rounded-none transition-opacity duration-300 ${checked ? "opacity-100" : "opacity-0 group-hover:opacity-100 has-[:focus-visible]:opacity-100 [@media(hover:none)]:opacity-100"}`}
                >
                  <Checkbox.Content
                    className={`relative block h-full w-full gap-0 rounded-none p-0 text-[#F3F8FC] shadow-none [clip-path:polygon(0_0,100%_0,100%_100%)] transition-colors duration-300 ${checked ? "bg-[#2F81F7]" : "bg-[#182235] hover:bg-[#202D44]"}`}
                  >
                    <span className="pointer-events-none absolute right-[11px] top-[11px] grid size-4 place-items-center">
                      {checked ? (
                        <Check size={15} strokeWidth={2.8} />
                      ) : (
                        <Square size={14} />
                      )}
                    </span>
                  </Checkbox.Content>
                </Checkbox>
              </Card>
              {checked && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-40 rounded-2xl ring-2 ring-inset ring-[#2F81F7]"
                />
              )}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <EpisodePager
          page={page}
          totalPages={totalPages}
          totalRecords={totalRecords}
          loading={loading}
          onPage={changePage}
          className="mt-10"
        />
      )}

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

// Compact page-number list with first/last anchors and ellipsis, so long series
// (hundreds of episodes) stay navigable without a huge row of numbers.
function pageNumbers(page: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= 7)
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages: (number | "gap")[] = [1];
  if (page > 3) pages.push("gap");
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  for (let i = start; i <= end; i += 1) pages.push(i);
  if (page < totalPages - 2) pages.push("gap");
  pages.push(totalPages);
  return pages;
}

// HeroUI Pagination in its "With Summary" form: the summary spells out the
// episode range on the current page so the numbers read clearly.
function EpisodePager({
  page,
  totalPages,
  totalRecords,
  loading,
  onPage,
  className = "",
}: {
  page: number;
  totalPages: number;
  totalRecords: number;
  loading: boolean;
  onPage: (page: number) => void;
  className?: string;
}) {
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, totalRecords);
  return (
    <Pagination className={`w-full ${className}`}>
      <Pagination.Summary className="text-[#8FA3B4]">
        Episodios {start}–{end} de {totalRecords}
      </Pagination.Summary>
      <Pagination.Content>
        <Pagination.Item>
          <Pagination.Previous
            isDisabled={page <= 1 || loading}
            onPress={() => onPage(page - 1)}
          >
            <Pagination.PreviousIcon />
            <span>Anterior</span>
          </Pagination.Previous>
        </Pagination.Item>
        {pageNumbers(page, totalPages).map((entry, index) =>
          entry === "gap" ? (
            <Pagination.Item key={`gap-${index}`}>
              <Pagination.Ellipsis />
            </Pagination.Item>
          ) : (
            <Pagination.Item key={entry}>
              <Pagination.Link
                isActive={entry === page}
                isDisabled={loading}
                onPress={() => onPage(entry)}
              >
                {entry}
              </Pagination.Link>
            </Pagination.Item>
          ),
        )}
        <Pagination.Item>
          <Pagination.Next
            isDisabled={page >= totalPages || loading}
            onPress={() => onPage(page + 1)}
          >
            <span>Siguiente</span>
            <Pagination.NextIcon />
          </Pagination.Next>
        </Pagination.Item>
      </Pagination.Content>
    </Pagination>
  );
}

// Stepper composed from HeroUI Buttons + an input. The +/- use FUNCTIONAL state
// updates (setValue(v => v ± 1)), so no matter how fast they're clicked every
// press builds on the latest value — HeroUI's NumberField instead recomputes from
// a controlled prop and loses rapid clicks. Order (from ≤ to) is enforced at
// submit (openRange); each field clamps only to [1, max].
function EpisodeNumberField({
  label,
  value,
  setValue,
  max,
}: {
  label: string;
  value: number;
  setValue: Dispatch<SetStateAction<number>>;
  max: number;
}) {
  const clamp = (next: number) => Math.max(1, Math.min(max, next));
  return (
    <div className="w-28 max-sm:w-full">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-[#8FA3B4]">
        {label}
      </span>
      <div className="flex h-11 items-center overflow-hidden rounded-xl bg-[#111A2A]">
        <Button
          variant="tertiary"
          aria-label={`Reducir ${label.toLowerCase()}`}
          isDisabled={value <= 1}
          onPress={() => setValue((current) => clamp(current - 1))}
          className="h-full min-h-0 w-9 rounded-none bg-transparent px-0 text-[#8FA3B4] shadow-none hover:bg-transparent hover:text-[#F3F8FC]"
        >
          <Minus size={13} />
        </Button>
        <input
          type="text"
          inputMode="numeric"
          aria-label={`${label} episodio`}
          value={value}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "");
            setValue(digits ? clamp(Number.parseInt(digits, 10)) : 1);
          }}
          className="min-w-0 flex-1 bg-transparent text-center text-sm tabular-nums text-[#F3F8FC] outline-none"
        />
        <Button
          variant="tertiary"
          aria-label={`Aumentar ${label.toLowerCase()}`}
          isDisabled={value >= max}
          onPress={() => setValue((current) => clamp(current + 1))}
          className="h-full min-h-0 w-9 rounded-none bg-transparent px-0 text-[#8FA3B4] shadow-none hover:bg-transparent hover:text-[#F3F8FC]"
        >
          <Plus size={13} />
        </Button>
      </div>
    </div>
  );
}
