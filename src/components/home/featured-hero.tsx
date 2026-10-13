"use client";

import { Button, Tooltip } from "@heroui/react";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowLeft, ArrowRight, ExternalLink, Pause, Play } from "lucide-react";
import {
  type FocusEvent,
  type ComponentProps,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { FeaturedAnime } from "@/lib/api/client";
import { formatStatus, plural } from "@/lib/format";
import { AnimeImage } from "../anime-image";
import { ButtonLink } from "../button-link";

export const AUTOPLAY_DELAY_MS = 7_000;

/** Hero height, shared with the loading placeholder so nothing jumps. On
 *  phones it fills the screen below the header, within 34–40rem. */
export const HERO_HEIGHT_CLASS =
  "min-h-140 max-lg:min-h-130 max-sm:min-h-[clamp(34rem,calc(100svh-var(--header-height)),40rem)]";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const getReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
const getPageVisible = () => document.visibilityState === "visible";

/**
 * Pausable countdown to the next slide. It keeps the remaining time across
 * pauses, exactly like the CSS progress bar it drives (paused with
 * animation-play-state), so the bar and the real advance never drift.
 */
export class SlideTimer {
  private id: ReturnType<typeof setTimeout> | null = null;
  private startedAt = 0;
  private remaining: number;
  private running = false;

  constructor(
    private readonly delay: number,
    private readonly onElapsed: () => void,
  ) {
    this.remaining = delay;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.schedule();
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    if (this.id === null) return;
    clearTimeout(this.id);
    this.id = null;
    this.remaining = Math.max(
      0,
      this.remaining - (Date.now() - this.startedAt),
    );
  }

  /** A new slide is showing: count the full delay again. */
  restart() {
    this.remaining = this.delay;
    if (!this.running) return;
    if (this.id !== null) clearTimeout(this.id);
    this.schedule();
  }

  dispose() {
    this.running = false;
    if (this.id !== null) clearTimeout(this.id);
    this.id = null;
  }

  private schedule() {
    this.startedAt = Date.now();
    this.id = setTimeout(() => {
      this.id = null;
      this.remaining = this.delay;
      this.onElapsed();
      // onElapsed normally selects a slide, which restarts the timer.
      if (this.running && this.id === null) this.schedule();
    }, this.remaining);
  }
}

function titleClass(title: string) {
  if (title.length > 48) return "text-4xl max-lg:text-3xl";
  if (title.length > 24) return "text-5xl max-lg:text-4xl";
  return "text-6xl max-lg:text-5xl";
}

/** Facts separated by dots. Each dot leads its fact, and the list's
 *  negative margin puts the first dot of every line in the clipped area:
 *  a wrapped line never starts with a dot. */
function DotList({ items, className }: { items: string[]; className: string }) {
  return (
    <div className={`overflow-hidden ${className}`}>
      <ul className="-ml-5 flex flex-wrap">
        {items.map((item) => (
          <li
            key={item}
            className="before:inline-block before:w-5 before:text-center before:content-['·']"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function IconButton({
  label,
  ...props
}: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip delay={300}>
      <Button isIconOnly aria-label={label} {...props} />
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}

export function FeaturedHero({ anime }: { anime: FeaturedAnime[] }) {
  const [viewportRef, embla] = useEmblaCarousel({ loop: true, align: "start" });
  const [selected, setSelected] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [userPaused, setUserPaused] = useState(false);
  const [motionOptIn, setMotionOptIn] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [warm, setWarm] = useState(false);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    () => false,
  );
  const pageVisible = useSyncExternalStore(
    subscribeVisibility,
    getPageVisible,
    () => true,
  );

  const itemsRef = useRef(anime);
  const selectedIdRef = useRef(anime[0]?.id);
  const announceRef = useRef(false);
  const timerRef = useRef<SlideTimer | null>(null);
  const advanceRef = useRef(() => {});
  const sectionRef = useRef<HTMLElement>(null);
  // Set when a slide change starts while focus is inside the current slide,
  // which is about to become inert: focus then moves to the new slide.
  const moveFocusRef = useRef(false);

  const multiple = anime.length > 1;
  // What the user asked for (the play/pause button)…
  const autoplayWanted = !userPaused && (!reducedMotion || motionOptIn);
  // …and whether the countdown actually runs right now. Keyboard focus inside
  // the carousel, a drag or a hidden tab pause it without changing the intent.
  const running =
    Boolean(embla) &&
    multiple &&
    autoplayWanted &&
    !focusPaused &&
    !dragging &&
    pageVisible;

  const sync = useCallback(() => {
    if (!embla) return;
    const index = embla.selectedScrollSnap();
    const item = itemsRef.current[index];
    selectedIdRef.current = item?.id;
    setSelected(index);
    timerRef.current?.restart();
    // Only changes the user asked for are announced; autoplay stays silent
    // and clears the last announcement so it never describes another slide.
    if (announceRef.current && item) {
      announceRef.current = false;
      setAnnouncement(
        `${item.title}, destacado ${index + 1} de ${itemsRef.current.length}`,
      );
    } else {
      setAnnouncement("");
    }
  }, [embla]);

  const preserveSelection = useCallback(() => {
    if (!embla) return;
    const index = itemsRef.current.findIndex(
      (item) => item.id === selectedIdRef.current,
    );
    embla.scrollTo(Math.max(0, index), true);
    sync();
  }, [embla, sync]);

  useLayoutEffect(() => {
    const orderChanged =
      itemsRef.current.map((item) => item.id).join("\0") !==
      anime.map((item) => item.id).join("\0");
    itemsRef.current = anime;
    if (embla && orderChanged) embla.reInit();
  }, [anime, embla]);

  useLayoutEffect(() => {
    advanceRef.current = () => {
      if (!embla) return;
      if (embla.canScrollNext()) embla.scrollNext(reducedMotion);
      else embla.scrollTo(0, reducedMotion);
    };
  }, [embla, reducedMotion]);

  useEffect(() => {
    const timer = new SlideTimer(AUTOPLAY_DELAY_MS, () => advanceRef.current());
    timerRef.current = timer;
    return () => timer.dispose();
  }, []);

  useEffect(() => {
    if (running) timerRef.current?.start();
    else timerRef.current?.pause();
  }, [running]);

  useEffect(() => {
    if (!embla) return;
    const startDrag = () => {
      announceRef.current = true;
      setDragging(true);
    };
    const endDrag = () => setDragging(false);
    const settle = () => {
      announceRef.current = false;
    };
    embla.on("select", sync);
    embla.on("reInit", preserveSelection);
    embla.on("pointerDown", startDrag);
    embla.on("pointerUp", endDrag);
    embla.on("settle", settle);
    return () => {
      embla.off("select", sync);
      embla.off("reInit", preserveSelection);
      embla.off("pointerDown", startDrag);
      embla.off("pointerUp", endDrag);
      embla.off("settle", settle);
    };
  }, [embla, preserveSelection, sync]);

  // The other slides load once the page is done, so they never compete with
  // the first slide (the LCP) but are ready before autoplay reaches them.
  useEffect(() => {
    const warmUp = () => setWarm(true);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      timeout = setTimeout(warmUp, 600);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      window.removeEventListener("load", schedule);
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!moveFocusRef.current) return;
    moveFocusRef.current = false;
    sectionRef.current
      ?.querySelectorAll<HTMLElement>(".featured-slide")
      [selected]?.querySelector<HTMLElement>("a[href]")
      ?.focus();
  }, [selected]);

  const navigate = (target: "prev" | "next" | number) => {
    if (!embla) return;
    moveFocusRef.current = Boolean(
      document.activeElement?.closest(".featured-slide"),
    );
    announceRef.current = true;
    if (target === "prev") embla.scrollPrev(reducedMotion);
    else if (target === "next") embla.scrollNext(reducedMotion);
    else embla.scrollTo(target, reducedMotion);
    // select fires synchronously; a no-op (same slide) must not leave the
    // flags set for the next autoplay change.
    announceRef.current = false;
    if (embla.selectedScrollSnap() === selected) moveFocusRef.current = false;
  };

  const toggleAutoplay = () => {
    if (autoplayWanted) {
      setUserPaused(true);
      return;
    }
    setUserPaused(false);
    if (reducedMotion) setMotionOptIn(true);
    // An explicit "play" wins over the keyboard-focus pause (APG carousel).
    setFocusPaused(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft") navigate("prev");
    else if (event.key === "ArrowRight") navigate("next");
  };

  const handleFocus = (event: FocusEvent<HTMLElement>) => {
    const fromOutside = !event.currentTarget.contains(event.relatedTarget);
    if (fromOutside && event.target.matches(":focus-visible"))
      setFocusPaused(true);
  };

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget))
      setFocusPaused(false);
  };

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-background-secondary"
      aria-roledescription="carrusel"
      aria-label="Destacados"
      onKeyDown={multiple ? handleKeyDown : undefined}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      <div className="overflow-hidden" ref={viewportRef}>
        <div className="flex touch-pan-y">
          {anime.map((item, index) => {
            const status =
              item.status === "UNKNOWN" ? null : formatStatus(item.status);
            const facts = [
              status,
              item.startDate
                ? String(new Date(item.startDate).getUTCFullYear())
                : null,
              item.category?.name ?? null,
              item.episodeCount
                ? plural(item.episodeCount, "episodio", "episodios")
                : null,
            ].filter((fact): fact is string => Boolean(fact));
            return (
              <div
                className={`featured-slide relative flex min-w-0 shrink-0 basis-full ${HERO_HEIGHT_CLASS}`}
                key={item.id}
                role="group"
                aria-roledescription="diapositiva"
                aria-label={`${index + 1} de ${anime.length}`}
                inert={index !== selected}
              >
                <AnimeImage
                  src={item.backdropUrl}
                  srcSet={item.backdropSrcSet}
                  mobileSrc={item.posterUrl}
                  fallbackSrc={item.posterUrl}
                  alt=""
                  priority={index === 0}
                  loading={warm ? "eager" : "lazy"}
                  sizes="100vw"
                  imageClassName="max-sm:object-[50%_22%]"
                />
                <div
                  className="featured-scrim absolute inset-0"
                  aria-hidden="true"
                />
                <div className="page-container relative flex items-center pb-24 pt-16 max-sm:items-end max-sm:pt-20">
                  <div className="min-w-0 max-w-xl">
                    <h2
                      title={item.title}
                      className={`line-clamp-3 font-display font-bold leading-none tracking-tighter text-balance text-foreground text-shadow-lg wrap-anywhere ${titleClass(item.title)}`}
                    >
                      {item.title}
                    </h2>
                    {facts.length > 0 && (
                      <DotList
                        items={facts}
                        className="mt-5 text-sm font-medium text-subtle"
                      />
                    )}
                    {item.genres.length > 0 && (
                      <DotList
                        items={item.genres
                          .slice(0, 3)
                          .map((genre) => genre.name)}
                        className="mt-2 text-sm font-semibold text-link"
                      />
                    )}
                    {item.synopsis ? (
                      <p className="mt-4 line-clamp-3 max-w-prose text-sm leading-6 text-subtle">
                        {item.synopsis}
                      </p>
                    ) : null}
                    <div className="mt-6 flex flex-wrap gap-3">
                      <ButtonLink href={`/anime/${item.slug}`} prefetch={false}>
                        Ver ficha
                        <span className="sr-only">: {item.title}</span>
                      </ButtonLink>
                      {item.trailerUrl ? (
                        <ButtonLink
                          href={item.trailerUrl}
                          variant="secondary"
                          aria-label={`Ver tráiler de ${item.title} (se abre en otra pestaña)`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ver tráiler
                          <ExternalLink aria-hidden="true" />
                        </ButtonLink>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {multiple && (
        <div className="page-container absolute inset-x-0 bottom-6 flex items-center gap-2 max-sm:bottom-5">
          <IconButton
            label="Destacado anterior"
            variant="secondary"
            onPress={() => navigate("prev")}
          >
            <ArrowLeft aria-hidden="true" />
          </IconButton>
          <div
            role="group"
            aria-label="Elegir destacado"
            className="flex items-center"
          >
            {anime.map((item, index) => {
              const active = index === selected;
              return (
                <IconButton
                  key={item.id}
                  label={`Mostrar ${item.title}`}
                  variant="ghost"
                  aria-current={active ? "true" : undefined}
                  onPress={() => navigate(index)}
                >
                  <span
                    className={`h-1.5 overflow-hidden rounded-full bg-muted/45 transition-[width] duration-200 ${active ? "w-6" : "w-3"}`}
                  >
                    {active ? (
                      <span
                        key={selected}
                        data-testid="hero-progress"
                        data-state={
                          running
                            ? "running"
                            : autoplayWanted
                              ? "held"
                              : "paused"
                        }
                        className="block h-full origin-left rounded-full bg-brand motion-reduce:hidden data-[state=held]:opacity-50"
                        style={{
                          animation: `hero-progress ${AUTOPLAY_DELAY_MS}ms linear forwards`,
                          animationPlayState: running ? "running" : "paused",
                        }}
                      />
                    ) : null}
                  </span>
                </IconButton>
              );
            })}
          </div>
          <IconButton
            label={autoplayWanted ? "Pausar carrusel" : "Reanudar carrusel"}
            variant="secondary"
            onPress={toggleAutoplay}
          >
            {autoplayWanted ? (
              <Pause aria-hidden="true" />
            ) : (
              <Play aria-hidden="true" />
            )}
          </IconButton>
          <IconButton
            label="Destacado siguiente"
            variant="secondary"
            onPress={() => navigate("next")}
          >
            <ArrowRight aria-hidden="true" />
          </IconButton>
        </div>
      )}
    </section>
  );
}
