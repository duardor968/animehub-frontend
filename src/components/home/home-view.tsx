"use client";

import { Button } from "@heroui/react";
import { ArrowRight, RefreshCw } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { PosterGrid, PosterGridSkeleton } from "@/components/poster-grid";
import type { HomeResponse } from "@/lib/api/client";
import { fetchHome } from "@/lib/api/home";
import { MAIN_CONTENT_ID } from "@/lib/navigation";
import { FeaturedHero, HERO_HEIGHT_CLASS } from "./featured-hero";
import { RecentEpisodes, RecentEpisodesSkeleton } from "./recent-episodes";

export const HOME_POLL_INTERVAL_MS = 60_000;
const RECOVERY_DELAYS_MS = [5_000, 10_000];
const MAX_LOADING_FAILURES = 3;

export function isHomeComplete(home: HomeResponse | null) {
  return Boolean(
    home?.data.featured.length &&
    home.data.recentEpisodes.length &&
    home.data.recentAnime.length,
  );
}

// A temporarily missing section must not erase already visible content.
export function mergeHomeSnapshot(
  previous: HomeResponse | null,
  next: HomeResponse,
): HomeResponse {
  if (!previous) return next;
  const retained =
    (!next.data.featured.length && previous.data.featured.length > 0) ||
    (!next.data.recentEpisodes.length &&
      previous.data.recentEpisodes.length > 0) ||
    (!next.data.recentAnime.length && previous.data.recentAnime.length > 0);
  if (!retained) return next;
  return {
    data: {
      featured: next.data.featured.length
        ? next.data.featured
        : previous.data.featured,
      recentEpisodes: next.data.recentEpisodes.length
        ? next.data.recentEpisodes
        : previous.data.recentEpisodes,
      recentAnime: next.data.recentAnime.length
        ? next.data.recentAnime
        : previous.data.recentAnime,
    },
    meta: {
      ...next.meta,
      fetchedAt:
        previous.meta.fetchedAt < next.meta.fetchedAt
          ? previous.meta.fetchedAt
          : next.meta.fetchedAt,
      nextRefreshAt:
        previous.meta.nextRefreshAt < next.meta.nextRefreshAt
          ? previous.meta.nextRefreshAt
          : next.meta.nextRefreshAt,
      stale: true,
    },
  };
}

export function HomeView({
  initialHome,
}: {
  initialHome: HomeResponse | null;
}) {
  const [home, setHome] = useState(initialHome);
  const [failures, setFailures] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const retryRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    let disposed = false;
    let latest = initialHome;
    let failureCount = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: Promise<void> | null = null;
    let activeController: AbortController | null = null;
    let lastStartedAt: number | null = null;

    const clearTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const schedule = (delay: number) => {
      clearTimer();
      if (!disposed && document.visibilityState === "visible")
        timer = setTimeout(() => void load(), delay);
    };
    function load(): Promise<void> {
      if (disposed || document.visibilityState !== "visible")
        return Promise.resolve();
      // Concurrent triggers (poll, focus, manual retry) share one request.
      if (active) return active;
      clearTimer();
      const controller = new AbortController();
      activeController = controller;
      lastStartedAt = Date.now();
      active = (async () => {
        try {
          const response = await fetchHome(true, controller.signal);
          if (disposed || controller.signal.aborted) return;
          latest = mergeHomeSnapshot(latest, response);
          setHome(latest);
          failureCount = isHomeComplete(latest) ? 0 : failureCount + 1;
          setFailures(failureCount);
        } catch {
          if (disposed || controller.signal.aborted) return;
          failureCount += 1;
          setFailures(failureCount);
        } finally {
          active = null;
          activeController = null;
          schedule(
            controller.signal.aborted
              ? 0
              : !isHomeComplete(latest) && failureCount < MAX_LOADING_FAILURES
                ? (RECOVERY_DELAYS_MS[Math.max(0, failureCount - 1)] ??
                  HOME_POLL_INTERVAL_MS)
                : HOME_POLL_INTERVAL_MS,
          );
        }
      })();
      return active;
    }
    retryRef.current = load;
    const revalidate = () => {
      if (document.visibilityState !== "visible") {
        clearTimer();
        activeController?.abort();
        return;
      }
      if (active) return;
      // Focus and visibility often fire together; coalesce them.
      const remaining =
        lastStartedAt === null
          ? 0
          : Math.max(0, 1_000 - (Date.now() - lastStartedAt));
      if (remaining) {
        if (timer === undefined) schedule(remaining);
      } else void load();
    };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    if (isHomeComplete(initialHome)) schedule(HOME_POLL_INTERVAL_MS);
    else void load();

    return () => {
      disposed = true;
      clearTimer();
      activeController?.abort();
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [initialHome]);

  const retry = () => {
    setRetrying(true);
    void retryRef.current().finally(() => setRetrying(false));
  };

  const loading = failures < MAX_LOADING_FAILURES;
  const hasContent = Boolean(
    home?.data.featured.length ||
    home?.data.recentEpisodes.length ||
    home?.data.recentAnime.length,
  );
  if (!hasContent)
    return loading ? (
      <HomePlaceholder />
    ) : (
      <HomeUnavailable retrying={retrying} onRetry={retry} />
    );

  return (
    <main id={MAIN_CONTENT_ID} tabIndex={-1} className="outline-none">
      <h1 className="sr-only">AnimeHub: anime destacado y novedades</h1>
      {home!.data.featured.length > 0 && (
        <FeaturedHero anime={home!.data.featured} />
      )}
      <div className="page-container flex flex-col gap-16 py-12 max-sm:gap-12 max-sm:pt-10">
        <HomeSection
          id="episodios-recientes"
          eyebrow="Ahora"
          title="Episodios recientes"
          link={{ href: "/horario", label: "Ver horario" }}
        >
          {home!.data.recentEpisodes.length ? (
            <RecentEpisodes episodes={home!.data.recentEpisodes} />
          ) : (
            <MissingSection loading={loading}>
              <RecentEpisodesSkeleton />
            </MissingSection>
          )}
        </HomeSection>
        <HomeSection
          id="nuevos-en-el-catalogo"
          eyebrow="Descubrir"
          title="Nuevos en el catálogo"
          link={{ href: "/catalogo", label: "Ver catálogo" }}
        >
          {home!.data.recentAnime.length ? (
            <PosterGrid anime={home!.data.recentAnime} variant="home" />
          ) : (
            <MissingSection loading={loading}>
              <PosterGridSkeleton variant="home" />
            </MissingSection>
          )}
        </HomeSection>
      </div>
    </main>
  );
}

function HomeSection({
  id,
  eyebrow,
  title,
  link,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  link: { href: string; label: string };
  children: ReactNode;
}) {
  const headingId = `${id}-titulo`;
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <span className="eyebrow">{eyebrow}</span>
          <h2
            id={headingId}
            className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground max-sm:text-2xl"
          >
            {title}
          </h2>
        </div>
        <Link
          href={link.href}
          className="-mb-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-link outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus"
        >
          {link.label}
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </div>
      {children}
    </section>
  );
}

function MissingSection({
  loading,
  children,
}: {
  loading: boolean;
  children: ReactNode;
}) {
  return loading ? (
    <div role="status" aria-label="Cargando contenido">
      {children}
    </div>
  ) : (
    <p className="py-10 text-sm text-muted">
      Este contenido no está disponible temporalmente.
    </p>
  );
}

function SectionHeaderSkeleton({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="mb-5">
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground max-sm:text-2xl">
        {title}
      </h2>
    </div>
  );
}

export function HomePlaceholder() {
  return (
    <main
      id={MAIN_CONTENT_ID}
      tabIndex={-1}
      aria-label="Cargando portada"
      aria-busy="true"
      className="outline-none"
    >
      <div
        className={`featured-hero relative overflow-hidden bg-background-secondary ${HERO_HEIGHT_CLASS}`}
      >
        <span className="image-skeleton" aria-hidden="true" />
        <div
          aria-hidden="true"
          className={`relative page-container flex flex-col justify-center gap-4 pb-24 pt-16 max-sm:justify-end max-sm:pb-28 ${HERO_HEIGHT_CLASS}`}
        >
          <span className="h-3 w-24 rounded bg-surface-tertiary" />
          <span className="h-12 w-[min(28rem,80%)] rounded-lg bg-surface-tertiary" />
          <span className="h-4 w-[min(20rem,60%)] rounded bg-surface-tertiary/70" />
          <span className="mt-4 h-11 w-36 rounded-full bg-surface-tertiary" />
        </div>
      </div>
      <div className="page-container flex flex-col gap-16 py-12 max-sm:gap-12 max-sm:pt-10">
        <section>
          <SectionHeaderSkeleton eyebrow="Ahora" title="Episodios recientes" />
          <RecentEpisodesSkeleton />
        </section>
        <section>
          <SectionHeaderSkeleton
            eyebrow="Descubrir"
            title="Nuevos en el catálogo"
          />
          <PosterGridSkeleton variant="home" />
        </section>
      </div>
    </main>
  );
}

function HomeUnavailable({
  retrying,
  onRetry,
}: {
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <main
      id={MAIN_CONTENT_ID}
      tabIndex={-1}
      className="page-container grid min-h-[70vh] place-items-center py-20 text-center outline-none"
    >
      <div className="max-w-lg">
        <span className="eyebrow">Inicio</span>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-balance text-foreground max-sm:text-3xl">
          El contenido no está disponible temporalmente
        </h1>
        <p className="mt-4 text-muted">
          Volveremos a intentarlo automáticamente. Mientras tanto, puedes
          explorar el catálogo.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button
            className="h-11 rounded-full bg-accent px-6 font-semibold text-accent-foreground shadow-none hover:bg-accent-hover"
            isPending={retrying}
            onPress={onRetry}
          >
            <RefreshCw
              aria-hidden="true"
              size={16}
              className={
                retrying ? "animate-spin motion-reduce:animate-none" : ""
              }
            />
            {retrying ? "Reintentando…" : "Reintentar ahora"}
          </Button>
          <Link
            href="/catalogo"
            className="inline-flex h-11 items-center rounded-full bg-default px-6 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-default-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Ir al catálogo
          </Link>
        </div>
      </div>
    </main>
  );
}
