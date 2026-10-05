"use client";

import { useEffect, useState } from "react";
import { PosterGrid } from "@/components/poster-grid";
import type { HomeResponse } from "@/lib/api/client";
import { fetchHome } from "@/lib/api/home";
import { FeaturedHero } from "./featured-hero";
import { RecentEpisodes } from "./recent-episodes";

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

  useEffect(() => {
    let disposed = false;
    let latest = initialHome;
    let failureCount = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: AbortController | null = null;
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
    async function load() {
      if (disposed || active || document.visibilityState !== "visible") return;
      clearTimer();
      const controller = new AbortController();
      active = controller;
      lastStartedAt = Date.now();
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
        schedule(
          controller.signal.aborted
            ? 0
            : !isHomeComplete(latest) && failureCount < MAX_LOADING_FAILURES
              ? (RECOVERY_DELAYS_MS[Math.max(0, failureCount - 1)] ??
                HOME_POLL_INTERVAL_MS)
              : HOME_POLL_INTERVAL_MS,
        );
      }
    }
    const revalidate = () => {
      if (document.visibilityState !== "visible") {
        clearTimer();
        active?.abort();
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
      active?.abort();
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [initialHome]);

  const loading = failures < MAX_LOADING_FAILURES;
  const hasContent = Boolean(
    home?.data.featured.length ||
    home?.data.recentEpisodes.length ||
    home?.data.recentAnime.length,
  );
  if (!hasContent) return loading ? <HomePlaceholder /> : <HomeUnavailable />;

  return (
    <main>
      {home!.data.featured.length > 0 && (
        <FeaturedHero anime={home!.data.featured} />
      )}
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-16 px-6 py-12 max-sm:gap-12 max-sm:px-4 max-sm:pb-28 max-sm:pt-10">
        <section>
          <div className="mb-5 flex items-end justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#69A7FF]">
                Ahora
              </span>
              <h2 className="mt-1 font-(family-name:--font-display) text-3xl font-semibold tracking-tight text-[#F3F8FC] max-sm:text-2xl">
                Episodios recientes
              </h2>
            </div>
          </div>
          {home!.data.recentEpisodes.length ? (
            <RecentEpisodes episodes={home!.data.recentEpisodes} />
          ) : (
            <MissingSection loading={loading} />
          )}
        </section>
        <section className="mx-auto w-full max-w-[1152px]">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#69A7FF]">
                Descubrir
              </span>
              <h2 className="mt-1 font-(family-name:--font-display) text-3xl font-semibold tracking-tight text-[#F3F8FC] max-sm:text-2xl">
                Nuevos en el catálogo
              </h2>
            </div>
          </div>
          {home!.data.recentAnime.length ? (
            <PosterGrid anime={home!.data.recentAnime} variant="home" />
          ) : (
            <MissingSection loading={loading} />
          )}
        </section>
      </div>
    </main>
  );
}

function MissingSection({ loading }: { loading: boolean }) {
  return loading ? (
    <div
      className="relative min-h-56 overflow-hidden rounded-xl"
      role="status"
      aria-label="Cargando contenido"
    >
      <span className="image-skeleton" aria-hidden="true" />
    </div>
  ) : (
    <p className="py-10 text-sm text-[#8FA3B4]">
      Este contenido no está disponible temporalmente.
    </p>
  );
}

export function HomePlaceholder() {
  return (
    <main aria-label="Cargando portada" aria-busy="true">
      <div className="featured-hero relative min-h-[560px] overflow-hidden max-lg:min-h-[520px] max-sm:min-h-[640px]">
        <span className="image-skeleton" aria-hidden="true" />
      </div>
      <div className="mx-auto w-full max-w-[1600px] px-6 py-12 max-sm:px-4">
        <MissingSection loading />
      </div>
    </main>
  );
}

function HomeUnavailable() {
  return (
    <main className="mx-auto grid min-h-[70vh] w-full max-w-[1600px] place-items-center px-6 py-20 text-center">
      <div className="max-w-lg">
        <h1 className="font-(family-name:--font-display) text-4xl font-semibold tracking-tight text-[#F3F8FC]">
          El contenido no está disponible temporalmente
        </h1>
        <p className="mt-4 text-[#8FA3B4]">
          Aparecerá automáticamente cuando esté disponible.
        </p>
      </div>
    </main>
  );
}
