"use client";

import {
  Alert,
  Button,
  Checkbox,
  Label,
  NumberField,
  Spinner,
  Tooltip,
  Typography,
} from "@heroui/react";
import { Copy, Download, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  apiFetch,
  type Episode,
  type EpisodePageResponse,
} from "@/lib/api/client";
import { formatEpisodeNumber, formatNumber, plural } from "@/lib/format";
import { AnimeImage } from "../anime-image";
import { ButtonLink } from "../button-link";
import { EmptyState } from "../empty-state";
import {
  MediaCard,
  MediaCardBody,
  MediaCardLabel,
  MediaCardMedia,
} from "../media-card";
import { Pagination } from "../pagination";
import { activeStatuses } from "../downloads/download-activity";
import { MAX_JOB_EPISODES, useDownloads } from "../downloads/download-provider";
import { EpisodeDownloadButton } from "../downloads/episode-download-button";
import { describeApiError } from "../downloads/download-errors";
import type {
  DownloadActivityStatus,
  DownloadRequest,
} from "../downloads/download-types";
import { EPISODE_PAGE_SIZE, parseEpisodePage } from "./anime-detail";

const isBusy = (status: DownloadActivityStatus | undefined) =>
  status !== undefined && activeStatuses.has(status);

const dateFormatter = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const pageHref = (slug: string, page: number) =>
  `/anime/${slug}${page > 1 ? `?page=${page}` : ""}#episodios`;

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function useBusy(request: DownloadRequest) {
  const { getRequestStatus } = useDownloads();
  return isBusy(getRequestStatus(request));
}

/** Links go to the clipboard: the actions say "Copiar", not "Descargar". */
const useCopying = () => useDownloads().destination === "COPY";

function BusyIcon({ busy, copying }: { busy: boolean; copying: boolean }) {
  if (busy) return <Spinner size="sm" color="current" aria-hidden="true" />;
  return copying ? (
    <Copy aria-hidden="true" />
  ) : (
    <Download aria-hidden="true" />
  );
}

/** The header action of a movie: its only video. */
export function MovieDownloadButton({
  slug,
  title,
  episodeNumber,
}: {
  slug: string;
  title: string;
  episodeNumber: number;
}) {
  const { openDownload } = useDownloads();
  const copying = useCopying();
  const request = { slug, title, episodeNumbers: [episodeNumber], movie: true };
  const busy = useBusy(request);
  return (
    <Button isPending={busy} onPress={() => openDownload(request)}>
      <BusyIcon busy={busy} copying={copying} />
      {copying ? "Copiar enlaces" : "Descargar película"}
    </Button>
  );
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
  nextEpisodeAt?: string | null;
}) {
  const { openDownload, getRequestStatus, dockSlot } = useDownloads();
  const copying = useCopying();
  const [episodes, setEpisodes] = useState(initial);
  const [page, setPage] = useState(initialPage);
  const [selected, setSelected] = useState<number[]>([]);
  // The selection bar keeps its last count while it slides out.
  const [barCount, setBarCount] = useState(0);
  if (selected.length > 0 && selected.length !== barCount)
    setBarCount(selected.length);
  const [loadingPage, setLoadingPage] = useState<number | null>(null);
  const [pageError, setPageError] = useState<{
    page: number;
    message: string;
  } | null>(null);
  const [sentSelection, setSentSelection] = useState<DownloadRequest | null>(
    null,
  );
  const requestSeq = useRef(0);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  // After a page change the user asked for: "list" moves keyboard focus to
  // the new episodes, "if-lost" only when the focused control went away.
  const focusAfterLoad = useRef<"list" | "if-lost" | null>(null);
  const totalPages = Math.max(1, Math.ceil(totalRecords / EPISODE_PAGE_SIZE));
  const loading = loadingPage !== null;
  // Each way to download shows only when it does something the others
  // don't: two episodes need no selection, one page needs no range.
  const selectable = totalRecords > 2;

  const allRequest: DownloadRequest = {
    slug,
    title,
    all: true,
    total: totalRecords,
  };
  const selectionRequest: DownloadRequest = {
    slug,
    title,
    episodeNumbers: selected,
  };
  const allBusy = useBusy(allRequest);

  // Clear the selection once the episodes it described were delivered.
  const sentStatus = sentSelection
    ? getRequestStatus(sentSelection)
    : undefined;
  if (sentSelection && sentStatus && !isBusy(sentStatus)) {
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
    async (target: number, { userAction }: { userAction: boolean }) => {
      const sequence = ++requestSeq.current;
      // Back/forward never moves focus.
      focusAfterLoad.current = userAction ? "if-lost" : null;
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
        // Paged from further down: back to the top of the list (html's
        // scroll-padding clears the header) and keyboard focus follows.
        const toolbar = toolbarRef.current;
        const header = Number.parseFloat(
          getComputedStyle(document.documentElement).scrollPaddingTop,
        );
        if (
          userAction &&
          toolbar &&
          toolbar.getBoundingClientRect().top < (header || 0)
        ) {
          toolbar.scrollIntoView({
            behavior: reducedMotion() ? "auto" : "smooth",
            block: "start",
          });
          focusAfterLoad.current = "list";
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

  async function changePage(target: number) {
    if (loading || (target === page && pageError === null)) return;
    if (await loadPage(target, { userAction: true }))
      window.history.pushState(null, "", pageHref(slug, target));
  }

  useEffect(() => {
    const intent = focusAfterLoad.current;
    if (!intent || loading) return;
    focusAfterLoad.current = null;
    if (pageError !== null) return;
    const active = document.activeElement;
    if (intent === "list" || !active || active === document.body)
      listRef.current?.focus({ preventScroll: true });
  }, [episodes, loading, pageError]);

  const pageFromUrl = useCallback(
    () =>
      parseEpisodePage(
        new URL(window.location.href).searchParams.get("page"),
        totalPages,
      ),
    [totalPages],
  );

  // Back to this page from another one: Next restores the router tree of
  // the original render (page 1) while the URL keeps ?page=N. Follow the URL.
  useEffect(() => {
    const fromUrl = pageFromUrl();
    if (fromUrl === initialPage) return;
    let active = true;
    queueMicrotask(() => {
      if (active) void loadPage(fromUrl, { userAction: false });
    });
    return () => {
      active = false;
    };
    // Mount only: later changes come from changePage/popstate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back/forward between episode pages: follow the URL.
  useEffect(() => {
    const onPopState = () =>
      void loadPage(pageFromUrl(), { userAction: false });
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [loadPage, pageFromUrl]);

  if (totalRecords === 0) {
    return (
      <section id="episodios" aria-labelledby="episodios-titulo">
        <Typography type="h2" id="episodios-titulo" className="mb-4">
          Episodios
        </Typography>
        <EmptyState
          title="Aún no hay episodios"
          description={
            nextEpisodeAt
              ? `El primero se publica el ${dateFormatter.format(new Date(nextEpisodeAt))}.`
              : undefined
          }
          action={
            <ButtonLink href="/horario" variant="secondary" prefetch={false}>
              Ver horario
            </ButtonLink>
          }
        />
      </section>
    );
  }

  const visibleNumbers = episodes.map((episode) => episode.number);
  const selectedOnPage = visibleNumbers.filter((number) =>
    selected.includes(number),
  ).length;
  const allVisible = selectedOnPage === visibleNumbers.length;
  const pager = {
    page,
    totalPages,
    href: (target: number) => pageHref(slug, target),
    onChange: (target: number) => void changePage(target),
    pendingPage: loadingPage ?? undefined,
  };

  function toggleEpisode(number: number) {
    setSelected((current) =>
      current.includes(number)
        ? current.filter((entry) => entry !== number)
        : [...current, number],
    );
  }

  function downloadSelection() {
    if (selected.length === 0 || selected.length > MAX_JOB_EPISODES) return;
    const request = { ...selectionRequest, episodeNumbers: [...selected] };
    setSentSelection(request);
    openDownload(request);
  }

  return (
    <section id="episodios" aria-labelledby="episodios-titulo">
      <div className="mb-4 flex items-center justify-between gap-4">
        <Typography type="h2" id="episodios-titulo">
          Episodios
        </Typography>
        {totalRecords > 1 && (
          <Button
            // One primary per view: with a selection, its bar's "Descargar".
            variant={selected.length > 0 ? "secondary" : "primary"}
            isPending={allBusy}
            onPress={() => openDownload(allRequest)}
          >
            <BusyIcon busy={allBusy} copying={copying} />
            {copying ? "Copiar todo" : "Descargar todo"}
          </Button>
        )}
      </div>

      {totalPages > 1 && (
        <RangeDownload
          slug={slug}
          title={title}
          firstNumber={firstNumber}
          lastNumber={lastNumber}
          totalRecords={totalRecords}
          copying={copying}
        />
      )}

      {(selectable || totalPages > 1) && (
        <div
          ref={toolbarRef}
          className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2"
        >
          {selectable && (
            <Checkbox
              className="checkbox-visible"
              isSelected={allVisible}
              isIndeterminate={!allVisible && selectedOnPage > 0}
              onChange={(isSelected) =>
                setSelected((current) =>
                  isSelected
                    ? [...new Set([...current, ...visibleNumbers])]
                    : current.filter(
                        (number) => !visibleNumbers.includes(number),
                      ),
                )
              }
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Label>
                  {totalPages > 1
                    ? "Seleccionar esta página"
                    : "Seleccionar todos"}
                </Label>
              </Checkbox.Content>
            </Checkbox>
          )}
          <Pagination
            {...pager}
            label="Páginas de episodios"
            className="ml-auto w-auto"
          />
        </div>
      )}

      {pageError && (
        <Alert status="danger" role="alert" className="mb-4">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              No se pudo cargar la página {pageError.page}
            </Alert.Title>
            <Alert.Description>{pageError.message}</Alert.Description>
          </Alert.Content>
          <Button
            size="sm"
            variant="danger-soft"
            onPress={() => void changePage(pageError.page)}
          >
            Reintentar
          </Button>
        </Alert>
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

      <ol
        ref={listRef}
        tabIndex={-1}
        aria-busy={loading}
        aria-label={
          totalPages > 1
            ? `Episodios, página ${formatNumber(page)} de ${formatNumber(totalPages)}`
            : "Episodios"
        }
        className={`grid gap-2 outline-none transition-opacity duration-150 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 ${loading ? "pointer-events-none opacity-55" : ""}`}
      >
        {episodes.map((episode) => (
          <EpisodeItem
            key={episode.id}
            episode={episode}
            slug={slug}
            title={title}
            fallbackSrc={backdropUrl ?? posterUrl}
            selection={
              selectable
                ? {
                    checked: selected.includes(episode.number),
                    active: selected.length > 0,
                    onToggle: () => toggleEpisode(episode.number),
                  }
                : null
            }
          />
        ))}
      </ol>

      <Pagination
        {...pager}
        label="Páginas de episodios, final de la lista"
        className="mt-12 justify-center"
      />

      {barCount > 0 &&
        dockSlot &&
        createPortal(
          <SelectionBar
            count={barCount}
            copying={copying}
            exiting={selected.length === 0}
            onExited={() => setBarCount(0)}
            busy={isBusy(getRequestStatus(selectionRequest))}
            onDownload={downloadSelection}
            onClear={() => {
              setSelected([]);
              // The bar turns inert as it leaves: keep the focus on the list.
              toolbarRef.current
                ?.querySelector<HTMLInputElement>('input[type="checkbox"]')
                ?.focus({ preventScroll: true });
            }}
          />,
          dockSlot,
        )}
    </section>
  );
}

// From 640px with a mouse, the card's controls show on hover or focus, and
// while a download they started is pending.
const revealOnHover =
  "transition-opacity sm:pointer-fine:opacity-0 sm:pointer-fine:group-hover:opacity-100 sm:pointer-fine:focus-within:opacity-100 sm:pointer-fine:has-[[data-pending=true]]:opacity-100";
/** The download button also grows from 90% as it shows. */
const growOnReveal =
  "sm:pointer-fine:[&>*]:scale-90 sm:pointer-fine:group-hover:[&>*]:scale-100 sm:pointer-fine:focus-within:[&>*]:scale-100";

/**
 * A card from 640px; below, a compact row (thumbnail, number, selection and
 * download) where the selection label fills the row as its touch target.
 */
function EpisodeItem({
  episode,
  slug,
  title,
  fallbackSrc,
  selection,
}: {
  episode: Episode;
  slug: string;
  title: string;
  fallbackSrc?: string | null;
  selection: { checked: boolean; active: boolean; onToggle: () => void } | null;
}) {
  const number = formatEpisodeNumber(episode.number);
  const name = episode.title?.trim() || `Episodio ${number}`;
  return (
    <li>
      <MediaCard className="group h-full max-sm:[&>*]:flex-row max-sm:[&>*]:items-center max-sm:[&>*]:gap-3">
        <MediaCardMedia aspect="still" className="max-sm:w-24 max-sm:shrink-0">
          <AnimeImage
            src={episode.imageUrl}
            fallbackSrc={fallbackSrc}
            alt=""
            sizes="(max-width: 639px) 96px, (max-width: 1279px) 33vw, 240px"
          />
          <span className="max-sm:hidden">
            <MediaCardLabel>
              EP <strong>{number}</strong>
            </MediaCardLabel>
          </span>
        </MediaCardMedia>
        {selection ? (
          <Tooltip delay={300}>
            {/* A checkbox can't trigger a tooltip itself: this wrapper only
                takes the hover and the focus of the checkbox inside. */}
            <Tooltip.Trigger
              role="none"
              tabIndex={-1}
              className={`max-sm:flex max-sm:flex-1 max-sm:self-stretch sm:absolute sm:right-2 sm:top-2 ${selection.checked || selection.active ? "" : revealOnHover}`}
            >
              <Checkbox
                className="checkbox-visible max-sm:flex-1 max-sm:items-stretch"
                isSelected={selection.checked}
                onChange={selection.onToggle}
              >
                <Checkbox.Content className="max-sm:flex-1">
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Label className="sm:sr-only">{name}</Label>
                </Checkbox.Content>
              </Checkbox>
            </Tooltip.Trigger>
            <Tooltip.Content>
              {selection.checked ? "Deseleccionar" : "Seleccionar"}
            </Tooltip.Content>
          </Tooltip>
        ) : (
          <div className="contents sm:hidden">
            <MediaCardBody title={name} />
          </div>
        )}
        <div
          className={`shrink-0 max-sm:mr-1 sm:pointer-events-none sm:absolute sm:inset-x-0 sm:top-0 sm:grid sm:aspect-video sm:place-items-center sm:[&>*]:pointer-events-auto ${revealOnHover} ${growOnReveal}`}
        >
          <EpisodeDownloadButton
            slug={slug}
            title={title}
            episodeNumber={episode.number}
            withSeries={false}
          />
        </div>
      </MediaCard>
    </li>
  );
}

function SelectionBar({
  count,
  copying,
  exiting,
  onExited,
  busy,
  onDownload,
  onClear,
}: {
  count: number;
  copying: boolean;
  /** The selection was emptied: the bar slides out, then `onExited`. */
  exiting: boolean;
  onExited: () => void;
  busy: boolean;
  onDownload: () => void;
  onClear: () => void;
}) {
  const tooLarge = count > MAX_JOB_EPISODES;
  return (
    <div
      className="dock-bar pointer-events-auto flex w-full max-w-md items-center gap-2"
      data-exiting={exiting || undefined}
      inert={exiting}
      onAnimationEnd={(event) => {
        if (exiting && event.target === event.currentTarget) onExited();
      }}
    >
      <Tooltip delay={300}>
        <Button
          isIconOnly
          variant="ghost"
          aria-label="Deseleccionar"
          className="shrink-0"
          onPress={onClear}
        >
          <X aria-hidden="true" />
        </Button>
        <Tooltip.Content>Deseleccionar</Tooltip.Content>
      </Tooltip>
      <span className="mr-auto min-w-0 text-sm text-muted">
        {tooLarge ? (
          `Máximo ${formatNumber(MAX_JOB_EPISODES)} por descarga`
        ) : (
          <>
            <strong className="text-foreground">{formatNumber(count)}</strong>{" "}
            {count === 1 ? "seleccionado" : "seleccionados"}
          </>
        )}
      </span>
      <Button isDisabled={tooLarge} isPending={busy} onPress={onDownload}>
        <BusyIcon busy={busy} copying={copying} />
        {copying ? "Copiar" : "Descargar"}
      </Button>
    </div>
  );
}

// Spanish writes decimals with a comma ("12,5", as the cards show); a typed
// dot means the same. Without this, "12.5" would read as 125.
function commaDecimal(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== ".") return;
  event.preventDefault();
  document.execCommand("insertText", false, ",");
}

/** Every episode between two numbers, specials included (12,5 in 12–13). */
function RangeDownload({
  slug,
  title,
  firstNumber,
  lastNumber,
  totalRecords,
  copying,
}: {
  slug: string;
  title: string;
  firstNumber: number;
  lastNumber: number;
  totalRecords: number;
  copying: boolean;
}) {
  const { openDownload } = useDownloads();
  const [from, setFrom] = useState(firstNumber);
  const [to, setTo] = useState(
    Math.min(lastNumber, firstNumber + EPISODE_PAGE_SIZE - 1),
  );
  // Only a gapless whole numbering knows the count up front (the API also
  // sends the specials between the bounds).
  const gapless =
    Number.isInteger(firstNumber) &&
    Number.isInteger(lastNumber) &&
    totalRecords === lastNumber - firstNumber + 1;
  const request: DownloadRequest = {
    slug,
    title,
    from,
    to,
    ...(gapless ? { total: Math.floor(to) - Math.ceil(from) + 1 } : {}),
  };
  const busy = useBusy(request);

  // The steppers can't cross («Desde» stops at «Hasta» and the other way),
  // and a field left empty gets its value back.
  const field = (
    label: string,
    value: number,
    onChange: (value: number) => void,
    [minValue, maxValue]: [number, number],
  ) => (
    <NumberField
      className="w-36 max-sm:flex-1"
      value={value}
      onChange={(next) => {
        if (!Number.isNaN(next)) onChange(next);
      }}
      minValue={minValue}
      maxValue={maxValue}
      formatOptions={{ useGrouping: false, maximumFractionDigits: 1 }}
      onKeyDown={commaDecimal}
    >
      <Label>{label}</Label>
      <NumberField.Group>
        <Tooltip delay={300}>
          <NumberField.DecrementButton aria-label="Restar uno" />
          <Tooltip.Content>Restar uno</Tooltip.Content>
        </Tooltip>
        <NumberField.Input />
        <Tooltip delay={300}>
          <NumberField.IncrementButton aria-label="Sumar uno" />
          <Tooltip.Content>Sumar uno</Tooltip.Content>
        </Tooltip>
      </NumberField.Group>
    </NumberField>
  );

  return (
    <div
      role="group"
      aria-label="Rango de episodios"
      className="mb-6 flex flex-wrap items-end gap-3"
    >
      {field("Desde", from, setFrom, [firstNumber, to])}
      {field("Hasta", to, setTo, [from, lastNumber])}
      <Button
        variant="secondary"
        className="max-sm:w-full"
        isPending={busy}
        onPress={() => openDownload(request)}
      >
        <BusyIcon busy={busy} copying={copying} />
        {copying ? "Copiar rango" : "Descargar rango"}
      </Button>
    </div>
  );
}
