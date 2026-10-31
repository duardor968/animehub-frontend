"use client";

import {
  Alert,
  Button,
  Checkbox,
  Dropdown,
  Label,
  NumberField,
  Separator,
  Spinner,
  Switch,
  toast,
  Tooltip,
  Typography,
  type Selection,
} from "@heroui/react";
import { Check, ChevronDown, Copy, Download, Square, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  apiFetch,
  type Episode,
  type EpisodePageResponse,
} from "@/lib/api/client";
import { formatEpisodeNumber, formatNumber, plural } from "@/lib/format";
import { siteUrl } from "@/lib/site";
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
import { destinationOptions } from "../downloads/download-panels";
import { remoteEpisodeNumbers } from "../downloads/remote-client";
import { MAX_JOB_EPISODES, useDownloads } from "../downloads/download-provider";
import { EpisodeDownloadButton } from "../downloads/episode-download-button";
import { describeApiError } from "../downloads/download-errors";
import type {
  DownloadActivityStatus,
  DownloadRequest,
} from "../downloads/download-types";
import {
  animePagePath,
  EPISODE_PAGE_SIZE,
  episodeAnchor,
  loadEpisodes,
  parseEpisodeOrder,
  parseEpisodePage,
  type EpisodeOrder,
} from "./anime-detail";

const isBusy = (status: DownloadActivityStatus | undefined) =>
  status !== undefined && activeStatuses.has(status);

const dateFormatter = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

type OrderState = { value: EpisodeOrder; default: EpisodeOrder };

const pageHref = (slug: string, page: number, order: OrderState) =>
  `${animePagePath(slug, page, order)}#episodios`;

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
  order: initialOrder = "asc",
  defaultOrder = "asc",
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
  /** The order of `initial`; `defaultOrder` is the work's, kept off the URL. */
  order?: EpisodeOrder;
  defaultOrder?: EpisodeOrder;
}) {
  const { openDownload, getRequestStatus, dockSlot } = useDownloads();
  const copying = useCopying();
  const [episodes, setEpisodes] = useState(initial);
  const [page, setPage] = useState(initialPage);
  const [order, setOrder] = useState(initialOrder);
  const orderState = { value: order, default: defaultOrder };
  const [selectingAll, setSelectingAll] = useState(false);
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
    async (
      target: number,
      targetOrder: EpisodeOrder,
      { userAction }: { userAction: boolean },
    ) => {
      const sequence = ++requestSeq.current;
      // Back/forward never moves focus.
      focusAfterLoad.current = userAction ? "if-lost" : null;
      setLoadingPage(target);
      setPageError(null);
      try {
        const data = await loadEpisodes(
          target,
          targetOrder,
          totalRecords,
          (apiPage) =>
            apiFetch<EpisodePageResponse>(
              `/anime/${encodeURIComponent(slug)}/episodes?page=${apiPage}`,
              {},
              true,
            ).then((response) => response.data),
        );
        if (sequence !== requestSeq.current) return false;
        setEpisodes(data);
        setPage(target);
        setOrder(targetOrder);
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
    [slug, totalRecords],
  );

  async function changePage(target: number, targetOrder = order) {
    if (
      loading ||
      (target === page && targetOrder === order && pageError === null)
    )
      return;
    if (await loadPage(target, targetOrder, { userAction: true }))
      window.history.pushState(
        null,
        "",
        pageHref(slug, target, { value: targetOrder, default: defaultOrder }),
      );
  }

  // pushState and popstate retain Next's original metadata. Follow the page
  // that actually loaded, including when Back restores an older router tree.
  useEffect(() => {
    const url = `${siteUrl}${animePagePath(slug, page, { value: order, default: defaultOrder })}`;
    const canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    const openGraphUrl = document.querySelector<HTMLMetaElement>(
      'meta[property="og:url"]',
    );
    if (canonical) canonical.href = url;
    if (openGraphUrl) openGraphUrl.content = url;
  }, [slug, page, order, defaultOrder]);

  // A fresh load streams the page in behind its skeleton (loading.tsx), and
  // the browser may look for #episodios or #episodio-N before it is shown.
  // Go there now, unless the reader already scrolled.
  useEffect(() => {
    const target = window.location.hash
      ? document.getElementById(window.location.hash.slice(1))
      : null;
    if (target && window.scrollY === 0)
      target.scrollIntoView({ behavior: "instant" });
  }, []);

  useEffect(() => {
    const intent = focusAfterLoad.current;
    if (!intent || loading) return;
    focusAfterLoad.current = null;
    if (pageError !== null) return;
    const active = document.activeElement;
    if (intent === "list" || !active || active === document.body)
      listRef.current?.focus({ preventScroll: true });
  }, [episodes, loading, pageError]);

  const fromUrl = useCallback(() => {
    const params = new URL(window.location.href).searchParams;
    return {
      page: parseEpisodePage(params.get("page"), totalPages),
      // One page holds everything: it keeps the work's order.
      order:
        totalPages > 1
          ? parseEpisodeOrder(params.get("orden"), defaultOrder)
          : defaultOrder,
    };
  }, [totalPages, defaultOrder]);

  // Back to this page from another one: Next restores the router tree of
  // the original render (page 1) while the URL keeps ?page=N. Follow the URL.
  useEffect(() => {
    const target = fromUrl();
    if (target.page === initialPage && target.order === initialOrder) return;
    let active = true;
    queueMicrotask(() => {
      if (active)
        void loadPage(target.page, target.order, { userAction: false });
    });
    return () => {
      active = false;
    };
    // Mount only: later changes come from changePage/popstate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back/forward between episode pages: follow the URL.
  useEffect(() => {
    const onPopState = () => {
      const target = fromUrl();
      void loadPage(target.page, target.order, { userAction: false });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [loadPage, fromUrl]);

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
  const allSelected = selected.length === totalRecords;
  const pager = {
    page,
    totalPages,
    href: (target: number) => pageHref(slug, target, orderState),
    onChange: (target: number) => void changePage(target),
    pendingPage: loadingPage ?? undefined,
  };

  /** Every episode number of the anime, whatever page shows. */
  async function everyEpisode() {
    if (totalPages === 1) return visibleNumbers;
    const gapless =
      Number.isInteger(firstNumber) &&
      Number.isInteger(lastNumber) &&
      totalRecords === lastNumber - firstNumber + 1;
    if (gapless)
      return Array.from(
        { length: totalRecords },
        (_, index) => firstNumber + index,
      );
    return remoteEpisodeNumbers({ slug, title, all: true });
  }

  async function selectAll(isSelected: boolean) {
    if (!isSelected) return setSelected([]);
    setSelectingAll(true);
    try {
      setSelected(await everyEpisode());
    } catch (error) {
      toast.danger("No se pudieron seleccionar todos", {
        description: describeApiError(error).detail,
        timeout: 8_000,
      });
    } finally {
      setSelectingAll(false);
    }
  }

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
          // It follows the page shown: its first and last episode.
          key={`${order}-${page}`}
          initialFrom={Math.min(...visibleNumbers)}
          initialTo={Math.max(...visibleNumbers)}
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
            // Every episode of the anime, on every page: "all but the first
            // two" is this and two clicks.
            <Checkbox
              className="checkbox-visible"
              isSelected={allSelected}
              isIndeterminate={!allSelected && selected.length > 0}
              isReadOnly={selectingAll}
              onChange={(isSelected) => void selectAll(isSelected)}
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Label>Seleccionar todos</Label>
              </Checkbox.Content>
            </Checkbox>
          )}
          {totalPages > 1 && (
            <Switch
              isSelected={order === "desc"}
              isDisabled={loading}
              onChange={(isSelected) =>
                void changePage(1, isSelected ? "desc" : "asc")
              }
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <Label>Más recientes primero</Label>
              </Switch.Content>
            </Switch>
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
        // While the selection bar floats over the page, the list ends above
        // it (globals.css).
        className={`episode-list grid gap-2 outline-none transition-opacity duration-150 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 ${loading ? "pointer-events-none opacity-55" : ""}`}
        data-docked={barCount > 0 || undefined}
      >
        {episodes.map((episode, index) => (
          <EpisodeItem
            key={episode.id}
            episode={episode}
            firstRow={index < 5}
            slug={slug}
            title={title}
            fallbackSrc={backdropUrl ?? posterUrl}
            selection={
              selectable
                ? {
                    checked: selected.includes(episode.number),
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

// From 640px with a mouse, the card's download button shows on hover or
// focus, and while a download it started is pending.
const revealOnHover =
  "transition-opacity sm:pointer-fine:opacity-0 sm:pointer-fine:group-hover:opacity-100 sm:pointer-fine:focus-within:opacity-100 sm:pointer-fine:has-[[data-pending=true]]:opacity-100";
/** The download button also grows from 90% as it shows. */
const growOnReveal =
  "sm:pointer-fine:[&>*]:scale-90 sm:pointer-fine:group-hover:[&>*]:scale-100 sm:pointer-fine:focus-within:[&>*]:scale-100";

/**
 * A card from 640px, selected from its corner; below, a compact row
 * (thumbnail, number, selection and download) where the selection label
 * fills the row as its touch target.
 */
function EpisodeItem({
  episode,
  slug,
  title,
  fallbackSrc,
  selection,
  firstRow,
}: {
  episode: Episode;
  slug: string;
  title: string;
  fallbackSrc?: string | null;
  selection: { checked: boolean; onToggle: () => void } | null;
  /** In the widest grid's first row (5 columns): it can be above the fold
   *  and, when the poster fails, the page's largest image. */
  firstRow: boolean;
}) {
  const number = formatEpisodeNumber(episode.number);
  const name = episode.title?.trim() || `Episodio ${number}`;
  return (
    <li id={episodeAnchor(episode.number)}>
      <MediaCard className="group h-full max-sm:[&>*]:flex-row max-sm:[&>*]:items-center max-sm:[&>*]:gap-3">
        <MediaCardMedia aspect="still" className="max-sm:w-24 max-sm:shrink-0">
          <AnimeImage
            src={episode.imageUrl}
            fallbackSrc={fallbackSrc}
            alt=""
            loading={firstRow ? "eager" : "lazy"}
            // Behind the poster, the page's LCP candidate.
            fetchPriority={firstRow ? "low" : undefined}
            sizes="(max-width: 639px) 96px, (max-width: 1279px) 33vw, 240px"
          />
          <span className="max-sm:hidden">
            <MediaCardLabel>
              EP <strong>{number}</strong>
            </MediaCardLabel>
          </span>
        </MediaCardMedia>
        {selection ? (
          <>
            <Checkbox
              className="checkbox-visible flex-1 items-stretch self-stretch sm:hidden"
              isSelected={selection.checked}
              onChange={selection.onToggle}
            >
              <Checkbox.Content className="flex-1">
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Label>{name}</Label>
              </Checkbox.Content>
            </Checkbox>
            {/* The card's corner, folded over it (globals.css). */}
            <Checkbox
              className="episode-select-corner max-sm:hidden"
              aria-label={`Seleccionar episodio ${number}`}
              isSelected={selection.checked}
              onChange={selection.onToggle}
            >
              <Checkbox.Content>
                <span className="episode-select-corner__icon">
                  {selection.checked ? (
                    <Check size={15} strokeWidth={2.8} aria-hidden="true" />
                  ) : (
                    <Square size={14} aria-hidden="true" />
                  )}
                </span>
              </Checkbox.Content>
            </Checkbox>
          </>
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

const destinationLabel = (id: string) =>
  destinationOptions.find((option) => option.id === id)?.label ?? id;

/** Where the selection goes, changed right there. The menu opens above the
 *  whole bar (`anchorRef`), so it never covers the count. */
function DestinationMenu({
  anchorRef,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
}) {
  const {
    destination,
    deviceProfile,
    pcTarget,
    pcs,
    loadPcs,
    chooseDestination,
    openSettings,
  } = useDownloads();
  const current =
    destination === "DESKTOP"
      ? pcTarget
        ? `PC · ${pcTarget.name}`
        : "AnimeHub para PC"
      : destinationLabel(destination);
  const selectedKey =
    destination === "DESKTOP"
      ? pcTarget
        ? `pc:${pcTarget.id}`
        : "DESKTOP"
      : destination;
  const options = [
    ...destinationOptions
      .filter(
        (option) => !(deviceProfile === "portable" && option.id === "CNL"),
      )
      .map((option) => ({ id: option.id, label: option.label })),
    ...(pcs.length
      ? pcs.map((pc) => ({ id: `pc:${pc.id}`, label: `PC · ${pc.name}` }))
      : destination === "DESKTOP"
        ? [{ id: "DESKTOP", label: current }]
        : []),
  ];
  const choose = (keys: Selection) => {
    const key = keys === "all" ? "" : String([...keys][0] ?? "");
    if (key.startsWith("pc:"))
      chooseDestination("DESKTOP", key.slice("pc:".length));
    else if (key && key !== "DESKTOP")
      chooseDestination(key as "CNL" | "MYJD" | "COPY");
  };
  return (
    <Dropdown onOpenChange={(open) => open && loadPcs()}>
      <Button
        size="sm"
        variant="tertiary"
        aria-label={`Destino: ${current}`}
        className="max-w-full"
      >
        <span className="min-w-0 truncate">{current}</span>
        <ChevronDown aria-hidden="true" />
      </Button>
      <Dropdown.Popover placement="top start" triggerRef={anchorRef}>
        <Dropdown.Menu
          aria-label="Destino"
          onAction={(key) => key === "settings" && openSettings()}
        >
          <Dropdown.Section
            aria-label="Destinos"
            selectionMode="single"
            selectedKeys={new Set([selectedKey])}
            onSelectionChange={choose}
          >
            {options.map((option) => (
              <Dropdown.Item
                key={option.id}
                id={option.id}
                textValue={option.label}
              >
                <Label>{option.label}</Label>
                <Dropdown.ItemIndicator />
              </Dropdown.Item>
            ))}
          </Dropdown.Section>
          <Separator />
          <Dropdown.Item
            id="settings"
            textValue="Preferencias de descarga"
            className="destination-menu__settings"
          >
            <Label>Preferencias de descarga</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
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
  const barRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={barRef}
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
      <div className="mr-auto flex min-w-0 flex-col items-start">
        <span className="text-sm text-muted">
          {tooLarge ? (
            `Máximo ${formatNumber(MAX_JOB_EPISODES)} por descarga`
          ) : (
            <>
              <strong className="text-foreground">{formatNumber(count)}</strong>{" "}
              {count === 1 ? "seleccionado" : "seleccionados"}
            </>
          )}
        </span>
        <DestinationMenu anchorRef={barRef} />
      </div>
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
  initialFrom,
  initialTo,
  firstNumber,
  lastNumber,
  totalRecords,
  copying,
}: {
  slug: string;
  title: string;
  /** Where the range starts and ends until it is edited. */
  initialFrom: number;
  initialTo: number;
  firstNumber: number;
  lastNumber: number;
  totalRecords: number;
  copying: boolean;
}) {
  const { openDownload } = useDownloads();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
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
