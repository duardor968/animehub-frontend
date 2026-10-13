"use client";

import { Skeleton } from "@heroui/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { PosterGrid, PosterGridSkeleton } from "@/components/poster-grid";
import { RetryButton } from "@/components/retry-button";
import { SectionHeading } from "@/components/section-heading";
import { StatusPage } from "@/components/status-page";
import {
  ApiConnectionError,
  ApiResponseError,
  ApiTimeoutError,
  type HomeResponse,
} from "@/lib/api/client";
import { fetchHome } from "@/lib/api/home";
import { MAIN_CONTENT_ID } from "@/lib/navigation";
import { FeaturedHero, HERO_HEIGHT_CLASS } from "./featured-hero";
import { RecentEpisodes } from "./recent-episodes";

const HOME_POLL_INTERVAL_MS = 60_000;

const PAGE_TITLE = "AnimeHub: anime destacado y novedades";

/** What went wrong with the last request, for the visitor. */
export function describeHomeError(error: unknown) {
  if (error instanceof ApiResponseError && error.status === 429)
    return "Demasiadas solicitudes en poco tiempo. Espera un momento antes de reintentar.";
  if (error instanceof ApiTimeoutError)
    return "El servidor tardó demasiado en responder.";
  if (error instanceof ApiConnectionError)
    return "No se pudo conectar con el servidor.";
  return "El servidor no está disponible ahora mismo.";
}

function isHomeComplete(home: HomeResponse | null) {
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

/**
 * Server content shows at once and refreshes every visible minute. Without
 * it (the server request failed), the browser tries once and then says what
 * happened, with a retry.
 */
export function HomeView({
  initialHome,
}: {
  initialHome: HomeResponse | null;
}) {
  const [home, setHome] = useState(initialHome);
  // Whether a browser request finished: until then, missing parts load.
  const [settled, setSettled] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const reloadRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    let latest = initialHome;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: Promise<void> | null = null;
    let activeController: AbortController | null = null;
    let lastStartedAt: number | null = null;
    let disposed = false;

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
      // Concurrent triggers (poll, focus, retry) share one request.
      if (active) return active;
      clearTimer();
      const controller = new AbortController();
      activeController = controller;
      lastStartedAt = Date.now();
      active = (async () => {
        try {
          const response = await fetchHome(true, controller.signal);
          if (controller.signal.aborted) return;
          latest = mergeHomeSnapshot(latest, response);
          setHome(latest);
          setFailure(null);
        } catch (error) {
          if (controller.signal.aborted) return;
          setFailure(describeHomeError(error));
        } finally {
          active = null;
          activeController = null;
          if (!controller.signal.aborted) setSettled(true);
          schedule(controller.signal.aborted ? 0 : HOME_POLL_INTERVAL_MS);
        }
      })();
      return active;
    }
    reloadRef.current = load;
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

  const retry = () => reloadRef.current();
  const {
    featured = [],
    recentEpisodes = [],
    recentAnime = [],
  } = home?.data ?? {};

  if (!featured.length && !recentEpisodes.length && !recentAnime.length)
    return settled ? (
      <StatusPage
        title="No se pudo cargar la portada"
        description={failure ?? describeHomeError(null)}
        action={<RetryButton onRetry={retry} />}
      />
    ) : (
      <HomePlaceholder />
    );

  // A section the API did not send: loading until the browser's request
  // settles, then what happened and a retry.
  const missing = (skeleton: ReactNode) =>
    settled ? (
      <EmptyState
        title="No se pudo cargar esta sección"
        description={failure ?? "El servidor aún no tiene estos datos."}
        action={<RetryButton variant="secondary" onRetry={retry} />}
      />
    ) : (
      skeleton
    );

  return (
    <main id={MAIN_CONTENT_ID} tabIndex={-1} className="outline-none">
      <h1 className="sr-only">{PAGE_TITLE}</h1>
      {featured.length > 0 && <FeaturedHero anime={featured} />}
      <HomeSections
        recentEpisodes={
          recentEpisodes.length ? (
            <RecentEpisodes episodes={recentEpisodes} />
          ) : (
            missing(<PosterGridSkeleton aspect="still" />)
          )
        }
        recentAnime={
          recentAnime.length ? (
            <PosterGrid anime={recentAnime} variant="home" />
          ) : (
            missing(<PosterGridSkeleton />)
          )
        }
      />
    </main>
  );
}

function HomeSections({
  recentEpisodes,
  recentAnime,
}: {
  recentEpisodes: ReactNode;
  recentAnime: ReactNode;
}) {
  return (
    <div className="page-container flex flex-col gap-12 pb-16 pt-12 max-sm:pb-12">
      <section aria-labelledby="episodios-recientes">
        <SectionHeading
          id="episodios-recientes"
          title="Episodios recientes"
          more={{ href: "/horario", label: "Ver horario" }}
        />
        {recentEpisodes}
      </section>
      <section aria-labelledby="ultimos-agregados">
        <SectionHeading
          id="ultimos-agregados"
          title="Últimos agregados"
          more={{ href: "/catalogo", label: "Ver catálogo" }}
        />
        {recentAnime}
      </section>
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
      <h1 className="sr-only">{PAGE_TITLE}</h1>
      <div
        aria-hidden="true"
        className={`bg-background-secondary ${HERO_HEIGHT_CLASS} flex`}
      >
        <div className="page-container flex flex-col justify-center gap-4 pb-24 pt-16 max-sm:justify-end">
          <Skeleton className="h-12 w-2/3 max-w-md" />
          <Skeleton className="h-4 w-1/2 max-w-xs" />
          <Skeleton className="h-4 w-full max-w-lg" />
          <Skeleton className="h-4 w-4/5 max-w-md" />
          <Skeleton className="mt-2 h-10 w-28" />
        </div>
      </div>
      <HomeSections
        recentEpisodes={<PosterGridSkeleton aspect="still" />}
        recentAnime={<PosterGridSkeleton />}
      />
    </main>
  );
}
