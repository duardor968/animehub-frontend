"use client";

import {
  AlertDialog,
  Button,
  Checkbox,
  Pagination,
  Spinner,
} from "@heroui/react";
import {
  AlertTriangle,
  Check,
  Download,
  Minus,
  Plus,
  RefreshCw,
  Square,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  apiFetch,
  type Episode,
  type EpisodePageResponse,
} from "@/lib/api/client";
import {
  formatEpisodeNumber,
  formatNumber,
  formatRelativeTime,
  plural,
} from "@/lib/format";
import { AnimeImage } from "../anime-image";
import { EPISODE_PAGE_SIZE, parseEpisodePage } from "./anime-detail";
import { MediaCard } from "../media-card";
import { MAX_JOB_EPISODES, useDownloads } from "../downloads/download-provider";
import { EpisodeDownloadButton } from "../downloads/episode-download-button";
import { describeApiError } from "../downloads/download-errors";
import type {
  DownloadActivityStatus,
  DownloadRequest,
} from "../downloads/download-types";

/** "Descargar todo" asks for confirmation above this many episodes. */
const CONFIRM_ALL_ABOVE = 24;
const busyStatuses = new Set<DownloadActivityStatus | undefined>([
  "resolving",
  "processing",
  "sending",
]);

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function pageHref(page: number) {
  const url = new URL(window.location.href);
  if (page <= 1) url.searchParams.delete("page");
  else url.searchParams.set("page", String(page));
  return `${url.pathname}${url.search}${url.hash}`;
}

export function EpisodeBrowser({
  slug,
  title,
  posterUrl,
  backdropUrl,
  initial,
  initialPage = 1,
  totalRecords,
  firstNumber,
  lastNumber,
  isMovie = false,
  nextEpisodeAt,
}: {
  slug: string;
  title: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  initial: Episode[];
  initialPage?: number;
  totalRecords: number;
  /** Lowest and highest episode numbers of the whole anime (range bounds). */
  firstNumber: number;
  lastNumber: number;
  isMovie?: boolean;
  nextEpisodeAt?: string | null;
}) {
  const { openDownload, getRequestStatus, preferences, dockSlot } =
    useDownloads();
  const [episodes, setEpisodes] = useState(initial);
  const [page, setPage] = useState(initialPage);
  const [selected, setSelected] = useState<number[]>([]);
  const [loadingPage, setLoadingPage] = useState<number | null>(null);
  const [pageError, setPageError] = useState<{
    page: number;
    message: string;
  } | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [sentSelection, setSentSelection] = useState<DownloadRequest | null>(
    null,
  );
  const requestSeq = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const totalPages = Math.max(1, Math.ceil(totalRecords / EPISODE_PAGE_SIZE));
  const loading = loadingPage !== null;
  const single = totalRecords === 1;

  const allRequest: DownloadRequest = {
    slug,
    title,
    all: true,
    total: totalRecords,
  };
  const singleRequest: DownloadRequest | null =
    single && episodes[0]
      ? { slug, title, episodeNumbers: [episodes[0].number] }
      : null;
  const selectionRequest: DownloadRequest = {
    slug,
    title,
    episodeNumbers: selected,
  };
  const selectionTooLarge = selected.length > MAX_JOB_EPISODES;

  // Clear the selection once the episodes it described were delivered.
  const sentStatus = sentSelection
    ? getRequestStatus(sentSelection)
    : undefined;
  if (sentSelection && sentStatus && !busyStatuses.has(sentStatus)) {
    if (sentStatus === "handed-off" || sentStatus === "partial") {
      const sent = new Set(sentSelection.episodeNumbers);
      if (
        selected.length === sent.size &&
        selected.every((number) => sent.has(number))
      )
        setSelected([]);
    }
    if (sentStatus !== "ready" && sentStatus !== "waiting-device")
      setSentSelection(null);
  }

  const loadPage = useCallback(
    async (target: number, { scroll }: { scroll: boolean }) => {
      const sequence = ++requestSeq.current;
      setLoadingPage(target);
      setPageError(null);
      try {
        const response = await apiFetch<EpisodePageResponse>(
          `/anime/${encodeURIComponent(slug)}/episodes?page=${target}`,
          {},
          true,
        );
        if (sequence !== requestSeq.current) return false;
        setEpisodes(response.data);
        setPage(target);
        if (scroll) {
          // Back to the top pager (or the list) when the user paged from
          // further down; html's scroll-padding keeps it below the header.
          const list = listRef.current;
          const target = document.getElementById("episodios-paginas") ?? list;
          const header = Number.parseFloat(
            getComputedStyle(document.documentElement).scrollPaddingTop,
          );
          if (
            target &&
            list &&
            list.getBoundingClientRect().top < (header || 0)
          ) {
            target.scrollIntoView({
              behavior: prefersReducedMotion() ? "auto" : "smooth",
              block: "start",
            });
          }
        }
        return true;
      } catch (error) {
        if (sequence === requestSeq.current)
          setPageError({
            page: target,
            message: describeApiError(error).detail,
          });
        return false;
      } finally {
        if (sequence === requestSeq.current) setLoadingPage(null);
      }
    },
    [slug],
  );

  async function changePage(nextPage: number) {
    const target = Math.max(1, Math.min(nextPage, totalPages));
    if (target === page && pageError === null) return;
    const loaded = await loadPage(target, { scroll: true });
    if (loaded) window.history.pushState(null, "", pageHref(target));
  }

  // Back/forward between episode pages: follow the URL.
  useEffect(() => {
    function onPopState() {
      const target = parseEpisodePage(
        new URL(window.location.href).searchParams.get("page"),
        totalPages,
      );
      void loadPage(target, { scroll: false });
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [loadPage, totalPages]);

  const visibleNumbers = episodes.map((episode) => episode.number);
  const selectedOnPage = visibleNumbers.filter((number) =>
    selected.includes(number),
  ).length;
  const allVisible =
    visibleNumbers.length > 0 && selectedOnPage === visibleNumbers.length;

  function toggleEpisode(number: number) {
    setSelected((current) =>
      current.includes(number)
        ? current.filter((entry) => entry !== number)
        : [...current, number],
    );
  }

  function downloadSelection() {
    if (selectionTooLarge || selected.length === 0) return;
    const request = { ...selectionRequest, episodeNumbers: [...selected] };
    setSentSelection(request);
    openDownload(request);
  }

  function downloadAll() {
    if (totalRecords > CONFIRM_ALL_ABOVE) {
      setConfirmAll(true);
      return;
    }
    openDownload(allRequest);
  }

  if (totalRecords === 0) {
    return (
      <section id="episodios" aria-labelledby="episodios-titulo">
        <SectionHeader
          subtitle="Este anime todavía no tiene episodios."
          action={null}
        />
        <div className="mt-6 rounded-2xl bg-surface px-6 py-10 text-center">
          <p className="font-display text-lg font-semibold text-foreground">
            Aún no hay episodios disponibles
          </p>
          <p className="mt-2 text-sm text-muted">
            {nextEpisodeAt
              ? `El primer episodio está previsto para el ${new Intl.DateTimeFormat("es", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(nextEpisodeAt))}.`
              : "Vuelve más tarde: aparecerán aquí en cuanto se publiquen."}
          </p>
        </div>
      </section>
    );
  }

  const allBusy = busyStatuses.has(getRequestStatus(allRequest));
  const singleBusy = singleRequest
    ? busyStatuses.has(getRequestStatus(singleRequest))
    : false;
  const destinationPhrase =
    preferences.destination === "COPY"
      ? "se copiarán al portapapeles"
      : preferences.destination === "MYJD"
        ? "se enviarán a MyJDownloader"
        : "se enviarán a JDownloader";

  return (
    <section
      id="episodios"
      aria-labelledby="episodios-titulo"
      className="relative"
    >
      <SectionHeader
        subtitle={
          single
            ? isMovie
              ? "Película disponible para descargar."
              : "1 episodio disponible."
            : `${plural(totalRecords, "episodio disponible", "episodios disponibles")}. Selecciona varios o descarga uno directamente.`
        }
        action={
          single && singleRequest ? (
            <Button
              className="h-11 rounded-full bg-accent px-5 font-semibold text-accent-foreground shadow-none outline-none hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              isPending={singleBusy}
              onPress={() => openDownload(singleRequest)}
            >
              <BusyIcon busy={singleBusy} />
              {isMovie ? "Descargar película" : "Descargar episodio"}
            </Button>
          ) : (
            <Button
              variant="secondary"
              className="h-11 rounded-full bg-default px-5 font-semibold text-foreground shadow-none outline-none hover:bg-default-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              isPending={allBusy}
              onPress={downloadAll}
            >
              <BusyIcon busy={allBusy} />
              Descargar todo ({formatNumber(totalRecords)})
            </Button>
          )
        }
      />

      {!single && (
        <RangeDownload
          slug={slug}
          title={title}
          firstNumber={firstNumber}
          lastNumber={lastNumber}
        />
      )}

      <p className="sr-only" aria-live="polite">
        {selected.length > 0
          ? plural(
              selected.length,
              "episodio seleccionado",
              "episodios seleccionados",
            )
          : ""}
      </p>

      {!single && (
        <div className="mt-5 flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2">
          <Checkbox
            isSelected={allVisible}
            isIndeterminate={!allVisible && selectedOnPage > 0}
            onChange={(isSelected) =>
              setSelected((current) =>
                isSelected
                  ? Array.from(new Set([...current, ...visibleNumbers]))
                  : current.filter(
                      (number) => !visibleNumbers.includes(number),
                    ),
              )
            }
            className="checkbox-visible min-h-11 justify-center text-sm text-subtle"
          >
            <Checkbox.Content className="gap-2.5">
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              {totalPages > 1
                ? `Seleccionar esta página (${visibleNumbers.length})`
                : `Seleccionar todos (${visibleNumbers.length})`}
            </Checkbox.Content>
          </Checkbox>
        </div>
      )}

      {totalPages > 1 && (
        <EpisodePager
          id="episodios-paginas"
          label="Páginas de episodios"
          page={loadingPage ?? page}
          totalPages={totalPages}
          totalRecords={totalRecords}
          loading={loading}
          onPage={(target) => void changePage(target)}
          className="mt-4"
        />
      )}

      {pageError !== null && (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground"
        >
          <AlertTriangle size={16} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 flex-1">
            No se pudo cargar la página {pageError.page}. {pageError.message}
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="min-h-9 rounded-lg bg-default px-3 font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus [@media(pointer:coarse)]:min-h-11"
            onPress={() => void changePage(pageError.page)}
          >
            <RefreshCw size={14} aria-hidden="true" /> Reintentar
          </Button>
        </div>
      )}

      <div
        id="episodios-lista"
        ref={listRef}
        className="relative mt-4"
        aria-busy={loading}
      >
        {/* Always rendered, so showing it never shifts the grid. */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 -top-2.5 h-0.5 overflow-hidden rounded-full transition-opacity duration-200 ${loading ? "opacity-100" : "opacity-0"}`}
        >
          {loading && (
            <span className="episode-loading-bar absolute inset-y-0 w-1/3 rounded-full bg-brand" />
          )}
        </span>
        <ol
          aria-label={
            totalPages > 1
              ? `Episodios, página ${page} de ${totalPages}`
              : "Episodios"
          }
          className={`grid grid-cols-5 gap-x-4 gap-y-5 transition-opacity max-xl:grid-cols-4 max-lg:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1 max-sm:gap-y-2 ${loading ? "pointer-events-none opacity-45" : ""}`}
        >
          {episodes.map((episode) => (
            <EpisodeItem
              key={episode.id}
              episode={episode}
              slug={slug}
              title={title}
              fallbackSrc={backdropUrl ?? posterUrl}
              checked={selected.includes(episode.number)}
              selectable={!single}
              onToggle={() => toggleEpisode(episode.number)}
            />
          ))}
        </ol>
      </div>

      {totalPages > 1 && (
        <EpisodePager
          label="Páginas de episodios (final de la lista)"
          page={loadingPage ?? page}
          totalPages={totalPages}
          totalRecords={totalRecords}
          loading={loading}
          onPage={(target) => void changePage(target)}
          className="mt-10"
        />
      )}

      {selected.length > 0 &&
        dockSlot &&
        createPortal(
          <SelectionBar
            count={selected.length}
            tooLarge={selectionTooLarge}
            busy={busyStatuses.has(getRequestStatus(selectionRequest))}
            onDownload={downloadSelection}
            onClear={() => setSelected([])}
          />,
          dockSlot,
        )}

      <AlertDialog.Backdrop
        isOpen={confirmAll}
        onOpenChange={setConfirmAll}
        isDismissable
        isKeyboardDismissDisabled={false}
      >
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog className="bg-background-secondary text-foreground">
            <AlertDialog.Header>
              <AlertDialog.Icon status="accent">
                <Download size={18} aria-hidden="true" />
              </AlertDialog.Icon>
              <AlertDialog.Heading className="font-display text-lg font-semibold">
                ¿Descargar los {formatNumber(totalRecords)} episodios?
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="text-sm leading-6 text-subtle">
              Los enlaces de {plural(totalRecords, "episodio", "episodios")} de{" "}
              <strong className="text-foreground">{title}</strong>{" "}
              {destinationPhrase}
              {preferences.providers.length > 1
                ? `, con hasta ${plural(preferences.providers.length, "espejo", "espejos")} por episodio`
                : ""}
              . Puedes cancelar mientras se preparan.
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                slot="close"
                variant="tertiary"
                className="min-h-11 rounded-xl px-4 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Cancelar
              </Button>
              <Button
                className="min-h-11 rounded-xl bg-accent px-4 font-semibold text-accent-foreground outline-none hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-focus"
                onPress={() => {
                  setConfirmAll(false);
                  openDownload(allRequest);
                }}
              >
                Descargar {formatNumber(totalRecords)}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </section>
  );
}

function BusyIcon({ busy }: { busy: boolean }) {
  return busy ? (
    <Spinner size="sm" color="current" aria-label="Preparando descarga" />
  ) : (
    <Download size={15} aria-hidden="true" />
  );
}

function SectionHeader({
  subtitle,
  action,
}: {
  subtitle: string;
  action: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-x-6 gap-y-4 border-b border-white/8 pb-5 max-sm:flex-col max-sm:items-start">
      <div className="min-w-0">
        <span className="eyebrow">Descargas</span>
        <h2
          id="episodios-titulo"
          className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground"
        >
          Episodios
        </h2>
        <p className="mt-2 text-sm text-muted">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function EpisodeItem({
  episode,
  slug,
  title,
  fallbackSrc,
  checked,
  selectable,
  onToggle,
}: {
  episode: Episode;
  slug: string;
  title: string;
  fallbackSrc?: string | null;
  checked: boolean;
  selectable: boolean;
  onToggle: () => void;
}) {
  const number = formatEpisodeNumber(episode.number);
  const published = episode.publishedAt
    ? formatRelativeTime(episode.publishedAt)
    : null;
  const subtitle = episode.title?.trim() || published;
  const selectLabel = `${checked ? "Quitar" : "Seleccionar"} episodio ${number}`;
  return (
    <li
      className={`group relative min-w-0 rounded-2xl outline-offset-2 outline-focus transition-shadow duration-300 hover:shadow-[0_18px_42px_rgb(0_0_0/0.3)] has-[.episode-select-corner_[data-focus-visible=true]]:outline-2 max-sm:rounded-xl ${checked ? "shadow-xl shadow-accent/15" : ""}`}
    >
      <MediaCard
        className={`touch-card relative min-w-0 gap-0 rounded-2xl p-0 transition-colors duration-300 max-sm:rounded-xl max-sm:p-2 max-sm:[&>.media-card-clip]:flex max-sm:[&>.media-card-clip]:items-center max-sm:[&>.media-card-clip]:gap-2 ${checked ? "bg-surface-secondary" : "bg-surface"}`}
      >
        <div className="touch-static-media relative aspect-video w-full shrink-0 overflow-hidden bg-surface max-sm:w-24 max-sm:rounded-lg max-[359px]:w-20 [&_.anime-image_img]:transition-transform [&_.anime-image_img]:duration-700 [&_.anime-image_img]:ease-[cubic-bezier(.22,1,.36,1)] sm:group-hover:[&_.anime-image_img]:scale-[1.04]">
          <AnimeImage
            src={episode.imageUrl}
            fallbackSrc={fallbackSrc}
            alt=""
            sizes="(max-width: 639px) 96px, (max-width: 1100px) 42vw, 18vw"
          />
          <div
            className={`absolute bottom-0 left-0 flex h-7 items-center rounded-tr-lg px-3 text-[10px] font-bold max-sm:hidden ${checked ? "bg-surface-secondary" : "bg-surface"}`}
          >
            <span className="tracking-[.14em] text-link">EP</span>
            <strong className="ml-1.5 tabular-nums text-foreground">
              {number}
            </strong>
          </div>
          {published && (
            <time
              dateTime={episode.publishedAt ?? undefined}
              suppressHydrationWarning
              className="absolute left-2 top-2 rounded-md bg-background/80 px-1.5 py-0.5 text-[11px] font-semibold text-subtle max-sm:hidden"
            >
              {published}
            </time>
          )}
          <div className="episode-card-download-slot pointer-events-none absolute inset-0 grid place-items-center max-sm:hidden">
            <EpisodeDownloadButton
              slug={slug}
              title={title}
              episodeNumber={episode.number}
              className="pointer-events-auto scale-90 opacity-0 transition-[opacity,scale,background-color] duration-200 group-hover:scale-100 group-hover:opacity-100 focus-visible:scale-100 focus-visible:opacity-100 [@media(hover:none)]:scale-100 [@media(hover:none)]:opacity-100"
            />
          </div>
        </div>

        {/* Compact row (<640px): number + title/publish time, then actions. */}
        <div className="min-w-0 flex-1 sm:hidden">
          <p className="flex items-baseline gap-1.5 text-sm">
            <span className="text-[10px] font-bold tracking-[.14em] text-link">
              EP
            </span>
            <strong className="tabular-nums text-foreground">{number}</strong>
          </p>
          {subtitle && (
            <p
              className="mt-0.5 truncate text-xs text-muted"
              suppressHydrationWarning
            >
              {subtitle}
            </p>
          )}
        </div>

        {selectable && (
          <Checkbox
            isSelected={checked}
            onChange={onToggle}
            aria-label={selectLabel}
            className="checkbox-visible grid size-11 shrink-0 place-items-center sm:hidden"
          >
            <Checkbox.Content className="gap-0">
              <Checkbox.Control className="size-5">
                <Checkbox.Indicator />
              </Checkbox.Control>
            </Checkbox.Content>
          </Checkbox>
        )}
        <div className="shrink-0 sm:hidden">
          <EpisodeDownloadButton
            slug={slug}
            title={title}
            episodeNumber={episode.number}
          />
        </div>

        {/* Card corner selector (≥640px). It overshoots by 2px and shares the
            card's compositing mask, avoiding a seam at fractional scales. */}
        {selectable && (
          <Checkbox
            isSelected={checked}
            onChange={onToggle}
            aria-label={selectLabel}
            className={`episode-select-corner pointer-events-auto absolute right-[-2px] top-[-2px] z-30 block h-[54px] w-[54px] rounded-none transition-opacity duration-300 max-sm:hidden ${checked ? "opacity-100" : "opacity-0 group-hover:opacity-100 has-[[data-focus-visible=true]]:opacity-100 [@media(hover:none)]:opacity-100"}`}
          >
            <Checkbox.Content
              className={`relative block h-full w-full gap-0 rounded-none p-0 text-foreground shadow-none [clip-path:polygon(0_0,100%_0,100%_100%)] transition-colors duration-300 ${checked ? "bg-accent" : "bg-surface-tertiary hover:bg-default-hover data-[focus-visible=true]:bg-accent-soft-hover"}`}
            >
              <span className="pointer-events-none absolute right-[11px] top-[11px] grid size-4 place-items-center">
                {checked ? (
                  <Check size={15} strokeWidth={2.8} aria-hidden="true" />
                ) : (
                  <Square size={14} aria-hidden="true" />
                )}
              </span>
            </Checkbox.Content>
          </Checkbox>
        )}
      </MediaCard>
    </li>
  );
}

function SelectionBar({
  count,
  tooLarge,
  busy,
  onDownload,
  onClear,
}: {
  count: number;
  tooLarge: boolean;
  busy: boolean;
  onDownload: () => void;
  onClear: () => void;
}) {
  return (
    <div className="episode-selection-bar pointer-events-auto w-[min(100%,640px)] rounded-2xl bg-surface-secondary/96 p-3 pl-5 shadow-[0_24px_80px_rgb(0_0_0/0.62)] backdrop-blur-xl max-sm:p-2.5 max-sm:pl-4">
      <div className="flex items-center gap-3 max-sm:gap-2">
        <span className="min-w-0 text-sm text-subtle">
          <strong className="text-foreground">{formatNumber(count)}</strong>{" "}
          {count === 1 ? "seleccionado" : "seleccionados"}
        </span>
        <Button
          className="ml-auto min-h-11 rounded-full bg-accent px-5 font-semibold text-accent-foreground shadow-none outline-none hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-secondary max-sm:px-4"
          onPress={onDownload}
          isDisabled={tooLarge}
          isPending={busy}
        >
          <BusyIcon busy={busy} />
          <span>
            Descargar <span className="max-sm:hidden">selección</span>
          </span>
        </Button>
        <Button
          variant="ghost"
          className="min-h-11 rounded-full px-3 text-sm font-semibold text-muted shadow-none outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus"
          onPress={onClear}
        >
          Limpiar
        </Button>
      </div>
      {tooLarge && (
        <p className="mt-2 text-xs leading-5 text-warning">
          Puedes enviar hasta {formatNumber(MAX_JOB_EPISODES)} episodios a la
          vez. Para más, usa «Descargar todo» o un rango.
        </p>
      )}
    </div>
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

const pagerTarget =
  "outline-none focus-visible:ring-2 focus-visible:ring-focus [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11";

function EpisodePager({
  id,
  label,
  page,
  totalPages,
  totalRecords,
  loading,
  onPage,
  className = "",
}: {
  id?: string;
  label: string;
  page: number;
  totalPages: number;
  totalRecords: number;
  loading: boolean;
  onPage: (page: number) => void;
  className?: string;
}) {
  const start = (page - 1) * EPISODE_PAGE_SIZE + 1;
  const end = Math.min(page * EPISODE_PAGE_SIZE, totalRecords);
  return (
    <Pagination
      id={id}
      aria-label={label}
      className={`w-full gap-y-3 max-sm:flex-col max-sm:items-start ${className}`}
    >
      <Pagination.Summary className="text-muted">
        Episodios {formatNumber(start)}–{formatNumber(end)} de{" "}
        {formatNumber(totalRecords)}
      </Pagination.Summary>
      <Pagination.Content className="episode-pager-content">
        <Pagination.Item>
          <Pagination.Previous
            aria-label="Página anterior"
            className={pagerTarget}
            isDisabled={page <= 1 || loading}
            onPress={() => onPage(page - 1)}
          >
            <Pagination.PreviousIcon />
            <span className="max-sm:sr-only">Anterior</span>
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
                aria-label={`Página ${entry}`}
                className={pagerTarget}
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
            aria-label="Página siguiente"
            className={pagerTarget}
            isDisabled={page >= totalPages || loading}
            onPress={() => onPage(page + 1)}
          >
            <span className="max-sm:sr-only">Siguiente</span>
            <Pagination.NextIcon />
          </Pagination.Next>
        </Pagination.Item>
      </Pagination.Content>
    </Pagination>
  );
}

function RangeDownload({
  slug,
  title,
  firstNumber,
  lastNumber,
}: {
  slug: string;
  title: string;
  firstNumber: number;
  lastNumber: number;
}) {
  const { openDownload, getRequestStatus } = useDownloads();
  const min = Math.floor(firstNumber);
  const max = Math.max(min, Math.ceil(lastNumber));
  const [fromDraft, setFromDraft] = useState(String(min));
  const [toDraft, setToDraft] = useState(
    String(Math.min(max, min + EPISODE_PAGE_SIZE - 1)),
  );
  const errorId = useId();
  const clamp = (value: number) => Math.max(min, Math.min(max, value));
  const parse = (draft: string) =>
    draft.trim() === "" ? null : Number.parseInt(draft, 10);
  const from = parse(fromDraft);
  const to = parse(toDraft);
  const error =
    from === null || to === null
      ? "Indica el primer y el último episodio."
      : from > to
        ? "El episodio inicial debe ser menor o igual que el final."
        : null;
  const count = !error && from !== null && to !== null ? to - from + 1 : 0;
  const request: DownloadRequest | null =
    !error && from !== null && to !== null ? { slug, title, from, to } : null;
  const busy = request ? busyStatuses.has(getRequestStatus(request)) : false;

  return (
    <div className="mt-5 flex flex-wrap items-end gap-x-4 gap-y-3 rounded-2xl bg-surface px-4 py-4 max-md:flex-col max-md:items-stretch">
      <div className="mr-auto min-w-[12rem] self-center max-md:self-start">
        <strong className="block text-sm text-foreground">
          Descargar un rango
        </strong>
        <span className="mt-0.5 block text-xs text-muted">
          Episodios del {formatNumber(min)} al {formatNumber(max)}.
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-3 max-md:w-full">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 max-md:flex-1">
          <EpisodeNumberField
            label="Desde"
            accessibleName="Episodio inicial"
            draft={fromDraft}
            setDraft={setFromDraft}
            min={min}
            max={max}
            clamp={clamp}
            invalid={Boolean(error) && from !== null && to !== null}
            errorId={errorId}
          />
          <span className="pb-3 text-faint" aria-hidden="true">
            —
          </span>
          <EpisodeNumberField
            label="Hasta"
            accessibleName="Episodio final"
            draft={toDraft}
            setDraft={setToDraft}
            min={min}
            max={max}
            clamp={clamp}
            invalid={Boolean(error) && from !== null && to !== null}
            errorId={errorId}
          />
        </div>
        <Button
          className="h-11 rounded-full bg-accent px-5 font-semibold text-accent-foreground shadow-none outline-none hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface max-sm:w-full"
          isDisabled={!request}
          isPending={busy}
          onPress={() => {
            if (!request) return;
            setFromDraft(String(request.from));
            setToDraft(String(request.to));
            openDownload(request);
          }}
        >
          {busy && (
            <Spinner
              size="sm"
              color="current"
              aria-label="Preparando descarga"
            />
          )}
          {count > 0
            ? `Descargar ${plural(count, "episodio", "episodios")}`
            : "Descargar rango"}
        </Button>
      </div>
      <p
        id={errorId}
        className={`w-full text-xs text-warning ${error ? "" : "sr-only"}`}
        aria-live="polite"
      >
        {error ?? ""}
      </p>
    </div>
  );
}

// Stepper composed from HeroUI Buttons + a text input. The draft is a string
// so the field can be cleared while typing; it's clamped to the anime's
// episode numbers on blur and on the steppers, and validated before sending.
function EpisodeNumberField({
  label,
  accessibleName,
  draft,
  setDraft,
  min,
  max,
  clamp,
  invalid,
  errorId,
}: {
  label: string;
  accessibleName: string;
  draft: string;
  setDraft: (value: string | ((current: string) => string)) => void;
  min: number;
  max: number;
  clamp: (value: number) => number;
  invalid: boolean;
  errorId: string;
}) {
  const inputId = useId();
  const value = Number.parseInt(draft, 10);
  const step = (delta: number) =>
    setDraft((current) => {
      const parsed = Number.parseInt(current, 10);
      return String(clamp((Number.isFinite(parsed) ? parsed : min) + delta));
    });
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      step(1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      step(-1);
    }
  }
  const stepper =
    "h-full min-h-0 w-10 rounded-none bg-transparent [@media(pointer:coarse)]:w-11 px-0 text-muted shadow-none outline-none hover:bg-transparent hover:text-foreground focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus";
  return (
    <div className="w-32 max-md:w-full">
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.14em] text-muted"
      >
        {label}
      </label>
      <div
        className={`flex h-11 items-center rounded-xl bg-surface-secondary focus-within:ring-2 focus-within:ring-focus [&>*:first-child]:rounded-l-xl [&>*:last-child]:rounded-r-xl ${invalid ? "ring-1 ring-warning/70" : ""}`}
      >
        <Button
          variant="tertiary"
          aria-label={`Restar uno al ${accessibleName.toLowerCase()}`}
          isDisabled={Number.isFinite(value) && value <= min}
          onPress={() => step(-1)}
          className={stepper}
          excludeFromTabOrder
        >
          <Minus size={13} aria-hidden="true" />
        </Button>
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          role="spinbutton"
          aria-label={accessibleName}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={Number.isFinite(value) ? value : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={errorId}
          autoComplete="off"
          value={draft}
          onKeyDown={onKeyDown}
          onChange={(event) =>
            setDraft(event.target.value.replace(/\D/g, "").slice(0, 5))
          }
          onBlur={() =>
            setDraft((current) => {
              const parsed = Number.parseInt(current, 10);
              return Number.isFinite(parsed) ? String(clamp(parsed)) : current;
            })
          }
          className="h-full min-w-0 flex-1 bg-transparent text-center text-base tabular-nums text-foreground outline-none sm:text-sm"
        />
        <Button
          variant="tertiary"
          aria-label={`Sumar uno al ${accessibleName.toLowerCase()}`}
          isDisabled={Number.isFinite(value) && value >= max}
          onPress={() => step(1)}
          className={stepper}
          excludeFromTabOrder
        >
          <Plus size={13} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
