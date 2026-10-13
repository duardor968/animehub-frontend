"use client";

import { Chip, Skeleton, Tabs, type ChipProps } from "@heroui/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { components } from "@/lib/api/generated";
import { formatEpisodeNumber, plural } from "@/lib/format";
import { AnimeImage } from "./anime-image";
import { ButtonLink } from "./button-link";
import { EmptyState } from "./empty-state";
import {
  MediaCard,
  MediaCardBody,
  MediaCardLabel,
  MediaCardMedia,
} from "./media-card";
import {
  POSTER_GRID_CLASS,
  POSTER_GRID_SIZES,
  PosterGridSkeleton,
} from "./poster-grid";
import { subscribeMinute, useHydrated, zonePending } from "./schedule-client";
import {
  days,
  daySlugs,
  deriveScheduleEntry,
  formatScheduleTime,
  TIME_ZONE_COOKIE,
  zonedMoment,
  type ScheduleStatus,
} from "./schedule-status";

type ScheduleEntry = components["schemas"]["ScheduleEntryDto"];
type DisplayEntry = ScheduleEntry & {
  display: { number: number; status: ScheduleStatus };
  slot: number;
  time: string;
};

// Indexed like Date#getDay (0 = Sunday); the tabs start on Monday.
const weekOrder = [1, 2, 3, 4, 5, 6, 0];

const statusChips: Partial<
  Record<
    ScheduleStatus,
    { label: string; color: ChipProps["color"]; variant: ChipProps["variant"] }
  >
> = {
  aired: { label: "Emitido", color: "success", variant: "soft" },
  upcoming: { label: "Próximo", color: "accent", variant: "soft" },
  // Solid: expected right now, and the end of a series.
  due: { label: "Ahora", color: "accent", variant: "primary" },
  delayed: { label: "Retrasado", color: "warning", variant: "soft" },
  final: { label: "Final", color: "success", variant: "primary" },
};

// Don't re-run the server component more than this often when the tab regains
// focus, so quick tab-switching never hammers the API.
const REVALIDATE_THROTTLE_MS = 30_000;

/**
 * The server renders the week in `serverTimeZone` (the viewer's zone from the
 * `tz` cookie, UTC on a first visit) at `serverNow`; hydration reproduces that
 * exact output, then the board switches to the viewer's own zone and clock.
 * The selected day lives in `?dia=`, so Back returns to it.
 */
export function ScheduleBoard({
  entries,
  stale = false,
  serverNow,
  serverTimeZone,
  zoneConfirmed = true,
}: {
  entries: ScheduleEntry[];
  stale?: boolean;
  serverNow: string;
  serverTimeZone: string;
  /** serverTimeZone is the viewer's (cookie), not a first-visit guess. */
  zoneConfirmed?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydrated = useHydrated();
  // Advance the local day and statuses at minute boundaries, including midnight.
  const [liveNow, setLiveNow] = useState(() => new Date());
  useEffect(() => subscribeMinute(() => setLiveNow(new Date())), []);

  // Remember the viewer's zone so the next server render already matches it.
  useEffect(() => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zone && zone !== readTimeZoneCookie())
        document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // Cookies blocked: every visit renders in UTC first, then re-groups.
    }
  }, []);

  // Publication needs new data, including while the user leaves this tab open.
  const lastRevalidatedAt = useRef(0);
  useEffect(() => {
    // Baseline the throttle at mount (an effect may read the clock; render may not),
    // so a focus event firing right after load doesn't trigger an immediate refetch.
    lastRevalidatedAt.current = Date.now();
    const revalidate = () => {
      if (document.visibilityState !== "visible") return;
      setLiveNow(new Date());
      if (Date.now() - lastRevalidatedAt.current < REVALIDATE_THROTTLE_MS)
        return;
      lastRevalidatedAt.current = Date.now();
      router.refresh();
    };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    const id = window.setInterval(revalidate, 60_000);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [router]);

  const now = useMemo(
    () => (hydrated ? liveNow : new Date(serverNow)),
    [hydrated, liveNow, serverNow],
  );
  const timeZone = hydrated ? undefined : serverTimeZone;
  const todayIndex = zonedMoment(now, timeZone).weekday;

  const grouped = useMemo(() => {
    const groups = Array.from({ length: 7 }, () => [] as DisplayEntry[]);
    for (const entry of entries) {
      const display = deriveScheduleEntry(entry, { now, timeZone, stale });
      if (!display) continue;
      const published = new Date(entry.basisPublishedAt);
      const moment = zonedMoment(published, timeZone);
      groups[moment.weekday].push({
        ...entry,
        display,
        slot: moment.minutes,
        time: formatScheduleTime(published, timeZone),
      });
    }
    // Ordered by the hour a series airs, independent of which week it last aired.
    groups.forEach((group) => group.sort((a, b) => a.slot - b.slot));
    return groups;
  }, [entries, now, stale, timeZone]);

  // Without `?dia=`, open on today (the server's day while hydrating) and stay
  // there, e.g. past midnight.
  const [mountedDay] = useState(() => zonedMoment(new Date()).weekday);
  const urlDay = daySlugs.indexOf(searchParams.get("dia") ?? "");
  const selectedIndex =
    urlDay >= 0 ? urlDay : hydrated ? mountedDay : todayIndex;
  // React Aria re-mounts the tabs once after hydration, and the underline
  // would replay a slide from a wrong place: it slides once the user picks.
  const [userPicked, setUserPicked] = useState(false);

  const pending = zonePending(hydrated, zoneConfirmed, serverTimeZone);
  return (
    <div className="relative" data-zone-pending={pending}>
      {pending && <PendingZone zone={pending} />}
      <Tabs
        variant="secondary"
        className="gap-6"
        selectedKey={daySlugs[selectedIndex]}
        // Not router.replace: that would re-render the page on the server.
        onSelectionChange={(key) => {
          setUserPicked(true);
          window.history.replaceState(null, "", `?dia=${key}`);
        }}
        data-slide={userPicked}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Días de la semana">
            {weekOrder.map((index) => {
              const count = grouped[index].length;
              const isToday = index === todayIndex;
              return (
                <Tabs.Tab
                  id={daySlugs[index]}
                  key={index}
                  ref={index === selectedIndex ? centerInStrip : undefined}
                  aria-label={`${days[index]}, ${plural(count, "episodio", "episodios")}${isToday ? ", hoy" : ""}`}
                  className="gap-2"
                >
                  <span className="capitalize">{days[index].slice(0, 3)}</span>
                  <span className="text-xs tabular-nums text-faint">
                    {count}
                  </span>
                  {isToday && (
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full bg-success"
                    />
                  )}
                  <Tabs.Indicator />
                </Tabs.Tab>
              );
            })}
          </Tabs.List>
        </Tabs.ListContainer>

        {weekOrder.map((index) => {
          const isSelected = index === selectedIndex;
          return (
            // Every day is in the HTML (search engines, no-JS); only the
            // selected one is shown and reachable.
            <Tabs.Panel
              id={daySlugs[index]}
              key={index}
              shouldForceMount
              className="data-[inert=true]:hidden"
            >
              <h2 className="sr-only">
                {days[index]}
                {index === todayIndex && " (hoy)"}
              </h2>
              {grouped[index].length === 0 ? (
                <EmptyState
                  title="Sin episodios este día"
                  action={
                    <ButtonLink
                      href="/catalogo"
                      variant="secondary"
                      prefetch={false}
                    >
                      Ver catálogo
                    </ButtonLink>
                  }
                />
              ) : (
                <ul className={POSTER_GRID_CLASS}>
                  {grouped[index].map((entry, entryIndex) => (
                    <li key={entry.anime.id} className="min-w-0">
                      <ScheduleCard
                        entry={entry}
                        priority={isSelected && entryIndex < 2}
                        eager={isSelected && entryIndex < 5}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Tabs.Panel>
          );
        })}
      </Tabs>
    </div>
  );
}

/**
 * While the week is grouped in a zone the server only guessed, it stays
 * hidden (globals.css) under a skeleton, unless the head script found the
 * viewer in that zone (html[data-tz]). The zone is a validated IANA name
 * (letters, digits, _ + - /), safe in the selectors.
 */
function PendingZone({ zone }: { zone: string }) {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `html[data-tz="${zone}"] [data-zone-pending="${zone}"],html[data-tz="${zone}"] .site-footer{visibility:visible}@media (scripting:enabled){html:not([data-tz="${zone}"]) .schedule-skeleton{display:flex;visibility:visible}}`,
        }}
      />
      <div
        aria-hidden="true"
        className="schedule-skeleton absolute inset-x-0 top-0 hidden flex-col gap-6"
      >
        <div className="flex h-8 items-center justify-around gap-2">
          {weekOrder.map((index) => (
            <Skeleton key={index} className="h-3.5 w-10" />
          ))}
        </div>
        <PosterGridSkeleton count={10} />
      </div>
    </>
  );
}

function ScheduleCard({
  entry,
  priority,
  eager,
}: {
  entry: DisplayEntry;
  /** First row on phones: the LCP candidates. */
  priority: boolean;
  /** Rest of the selected day's first row on wide screens. */
  eager: boolean;
}) {
  const { status, number } = entry.display;
  const chip = statusChips[status];
  return (
    <MediaCard className="h-full">
      <Link
        href={`/anime/${entry.anime.slug}`}
        prefetch={false}
        aria-label={[
          entry.anime.title,
          `episodio ${formatEpisodeNumber(number)}`,
          chip?.label.toLocaleLowerCase("es"),
          entry.time,
        ]
          .filter(Boolean)
          .join(", ")}
        className="flex flex-1 flex-col outline-none"
      >
        <MediaCardMedia aspect="poster">
          <AnimeImage
            src={entry.anime.posterUrl}
            fallbackSrc={entry.anime.backdropUrl}
            alt=""
            priority={priority}
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager && !priority ? "low" : undefined}
            sizes={POSTER_GRID_SIZES}
          />
          <MediaCardLabel position="top">
            <time dateTime={entry.time}>
              <strong>{entry.time}</strong>
            </time>
          </MediaCardLabel>
          <MediaCardLabel>
            EP <strong>{formatEpisodeNumber(number)}</strong>
          </MediaCardLabel>
        </MediaCardMedia>
        <MediaCardBody title={entry.anime.title}>
          {chip && (
            <Chip
              color={chip.color}
              variant={chip.variant}
              size="sm"
              className="mt-auto self-start"
            >
              <Chip.Label>{chip.label}</Chip.Label>
            </Chip>
          )}
        </MediaCardBody>
      </Link>
    </MediaCard>
  );
}

/** On narrow screens the strip scrolls: center the selected day. A ref, not
 *  an effect, because React Aria re-mounts the tabs once after hydration. */
function centerInStrip(tab: HTMLElement | null) {
  const strip = tab?.closest<HTMLElement>('[data-slot="scroll-shadow"]');
  if (tab && strip)
    strip.scrollLeft =
      tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2;
}

function readTimeZoneCookie() {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${TIME_ZONE_COOKIE}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}
