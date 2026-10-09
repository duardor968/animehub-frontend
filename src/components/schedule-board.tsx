"use client";

import { Card, Chip, Tabs } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Key,
} from "react";
import type { components } from "@/lib/api/generated";
import { plural } from "@/lib/format";
import { AnimeImage } from "./anime-image";
import { MediaCard } from "./media-card";
import {
  deriveScheduleEntry,
  formatScheduleTime,
  TIME_ZONE_COOKIE,
  zonedMoment,
  type ScheduleStatus,
} from "./schedule-status";

type ScheduleEntry = components["schemas"]["ScheduleEntryDto"];
type DisplayEntry = ScheduleEntry & {
  display: { number: number; status: ScheduleStatus };
  slotMinutes: number;
};

const days = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];
const daysShort = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
// Column order: Monday first (es locale), Sunday last. Indices stay aligned to
// Date.getDay() (0=Sun…6=Sat) so grouping, the "hoy" marker and tab ids don't move.
const weekOrder = [1, 2, 3, 4, 5, 6, 0];

const statusLabels: Record<ScheduleStatus, string | null> = {
  aired: "Emitido",
  upcoming: "Próximo",
  due: "Ahora",
  delayed: "Retrasado",
  final: "Final",
  unknown: null,
};

const statusChips: Record<
  Exclude<ScheduleStatus, "unknown">,
  {
    color: "accent" | "success" | "warning";
    variant: "soft" | "primary";
  }
> = {
  aired: { color: "success", variant: "soft" },
  upcoming: { color: "accent", variant: "soft" },
  // Expected right now (within the grace window): solid, so it stands out.
  due: { color: "accent", variant: "primary" },
  delayed: { color: "warning", variant: "soft" },
  // The series ended: solid, so it reads apart from a regular "Emitido".
  final: { color: "success", variant: "primary" },
};

// Don't re-run the server component more than this often when the tab regains
// focus, so quick tab-switching never hammers the API.
const REVALIDATE_THROTTLE_MS = 30_000;

const subscribeHydration = () => () => {};
const getHydratedSnapshot = () => true;
const getServerSnapshot = () => false;

function msToNextMinute() {
  return 60_000 - (Date.now() % 60_000) + 50;
}

/**
 * The server renders the week in `serverTimeZone` (the viewer's zone from the
 * `tz` cookie, UTC on a first visit) at `serverNow`; hydration reproduces that
 * exact output, then the board switches to the viewer's own zone and clock.
 */
export function ScheduleBoard({
  entries,
  stale = false,
  serverNow,
  serverTimeZone,
}: {
  entries: ScheduleEntry[];
  stale?: boolean;
  serverNow: string;
  serverTimeZone: string;
}) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    getHydratedSnapshot,
    getServerSnapshot,
  );
  // Advance the local day and statuses at minute boundaries, including midnight.
  const [liveNow, setLiveNow] = useState(() => new Date());
  useEffect(() => {
    let interval: number | undefined;
    const timeout = window.setTimeout(() => {
      setLiveNow(new Date());
      interval = window.setInterval(() => setLiveNow(new Date()), 60_000);
    }, msToNextMinute());
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, []);

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
      const moment = zonedMoment(new Date(entry.basisPublishedAt), timeZone);
      groups[moment.weekday].push({
        ...entry,
        display,
        slotMinutes: moment.minutes,
      });
    }
    // Ordered by the hour a series airs, independent of which week it last aired.
    groups.forEach((group) =>
      group.sort((a, b) => a.slotMinutes - b.slotMinutes),
    );
    return groups;
  }, [entries, now, stale, timeZone]);

  // Open on today: the server's day while hydrating, then the viewer's own
  // day. It stays put afterwards (e.g. at midnight) unless the user picks one.
  const [mountedDay] = useState(() => zonedMoment(new Date()).weekday);
  const serverDay = zonedMoment(new Date(serverNow), serverTimeZone).weekday;
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const openingDay = hydrated ? mountedDay : serverDay;
  const selectedKey = chosenDay ?? String(openingDay);

  // On narrow screens the strip scrolls: bring the opening day into view.
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const center = () => {
      const tab =
        scroller.querySelectorAll<HTMLElement>('[role="tab"]')[
          weekOrder.indexOf(openingDay)
        ];
      if (!tab || scroller.scrollWidth <= scroller.clientWidth) return;
      scroller.scrollLeft = Math.max(
        0,
        tab.offsetLeft - (scroller.clientWidth - tab.offsetWidth) / 2,
      );
    };
    center();
    // React Aria re-mounts the tab items once after hydration, which resets
    // the strip to the start: centre again until the user takes over.
    const observer = new MutationObserver(center);
    observer.observe(scroller, { childList: true, subtree: true });
    const release = () => observer.disconnect();
    const timeout = window.setTimeout(release, 3_000);
    const events = ["pointerdown", "wheel", "touchstart", "keydown"] as const;
    events.forEach((type) =>
      scroller.addEventListener(type, release, { passive: true }),
    );
    return () => {
      release();
      window.clearTimeout(timeout);
      events.forEach((type) => scroller.removeEventListener(type, release));
    };
  }, [openingDay]);

  return (
    <Tabs
      variant="secondary"
      aria-label="Días de la semana"
      selectedKey={selectedKey}
      onSelectionChange={(key: Key) => setChosenDay(String(key))}
      className="w-full gap-0"
    >
      {/* Own scroller instead of Tabs.ListContainer: HeroUI's overflow
          arrows are 16px with fixed English labels; a swipeable strip that
          scrolls today into view needs neither. The class keeps the
          secondary-variant underline styles. */}
      <div
        ref={scrollerRef}
        className="tabs__list-container mb-7 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Tabs.List
          aria-label="Días de la semana"
          className="w-max !min-w-0 gap-1 bg-transparent"
        >
          {weekOrder.map((index) => {
            const day = days[index];
            const count = grouped[index].length;
            const isToday = index === todayIndex;
            return (
              // The underline is CSS: HeroUI's animated indicator is re-mounted
              // with the items after hydration and can stick mid-transition.
              <Tabs.Tab
                id={String(index)}
                key={day}
                aria-label={`${day}, ${plural(count, "lanzamiento", "lanzamientos")}${isToday ? ", hoy" : ""}`}
                className="flex min-h-11 !w-auto items-center gap-2 px-3 text-sm text-muted shadow-none transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 data-[selected=true]:after:bg-brand data-[hovered=true]:text-subtle data-[selected=true]:font-semibold data-[selected=true]:text-foreground data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-inset data-[focus-visible=true]:ring-focus"
              >
                <span className="capitalize">{daysShort[index]}</span>
                <span className="text-xs tabular-nums text-faint">{count}</span>
                {isToday && (
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-success"
                  />
                )}
              </Tabs.Tab>
            );
          })}
        </Tabs.List>
      </div>

      {weekOrder.map((index) => {
        const day = days[index];
        const isSelected = selectedKey === String(index);
        return (
          // Every day is in the HTML (search engines, no-JS); only the selected
          // one is shown and reachable.
          <Tabs.Panel
            id={String(index)}
            key={day}
            shouldForceMount
            className="p-0 outline-none data-[inert=true]:hidden"
          >
            <div className="mb-4 flex items-baseline gap-2.5">
              <h2 className="font-display text-xl font-semibold capitalize text-foreground">
                {day}
                {index === todayIndex && (
                  <span className="sr-only"> (hoy)</span>
                )}
              </h2>
              <span className="text-xs text-muted">
                {plural(grouped[index].length, "lanzamiento", "lanzamientos")}
              </span>
            </div>

            {grouped[index].length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-surface py-16 text-center">
                <p className="text-sm text-muted">
                  No hay emisiones programadas para este día.
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
                {grouped[index].map((entry, entryIndex) => (
                  <li key={entry.anime.id} className="min-w-0">
                    <ScheduleCard
                      entry={entry}
                      time={formatScheduleTime(
                        new Date(entry.basisPublishedAt),
                        timeZone,
                      )}
                      priority={isSelected && entryIndex < 2}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Tabs.Panel>
        );
      })}
    </Tabs>
  );
}

function ScheduleCard({
  entry,
  time,
  priority,
}: {
  entry: DisplayEntry;
  time: string;
  priority: boolean;
}) {
  const { status, number } = entry.display;
  const label = statusLabels[status];
  const chip = status === "unknown" ? null : statusChips[status];
  return (
    <Link
      href={`/anime/${entry.anime.slug}`}
      aria-label={[
        entry.anime.title,
        `episodio ${number}`,
        label?.toLocaleLowerCase("es"),
        time,
      ]
        .filter(Boolean)
        .join(", ")}
      // Outer ring: an inset one would be painted under the card's own surface.
      className="group block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <MediaCard className="touch-card relative h-full min-w-0 gap-0 rounded-xl bg-surface p-0 transition-shadow duration-300 group-hover:shadow-[0_18px_42px_rgba(0,0,0,.3)] [&>.media-card-clip]:flex [&>.media-card-clip]:h-full [&>.media-card-clip]:flex-col">
        <div className="touch-static-media relative aspect-[2/3] overflow-hidden bg-surface [&_.anime-image_img]:transition-transform [&_.anime-image_img]:duration-700 [&_.anime-image_img]:ease-[cubic-bezier(.22,1,.36,1)] group-hover:[&_.anime-image_img]:scale-[1.04]">
          <AnimeImage
            src={entry.anime.posterUrl}
            fallbackSrc={entry.anime.backdropUrl}
            alt=""
            priority={priority}
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 16vw"
          />
          <time
            className="absolute left-2 top-2 rounded-lg bg-background-secondary/85 px-2 py-1 font-mono text-[11px] font-bold text-link backdrop-blur-sm"
            dateTime={entry.basisPublishedAt}
          >
            {time}
          </time>
          <div className="absolute bottom-0 left-0 flex h-6 items-center rounded-tr-lg bg-surface px-2.5 text-[11px] font-bold">
            <span className="tracking-[.12em] text-link">EP</span>
            <strong className="ml-1 tabular-nums text-foreground">
              {number}
            </strong>
          </div>
        </div>
        <Card.Content className="flex flex-1 flex-col items-start gap-2 px-3.5 py-3">
          <strong className="line-clamp-2 min-h-10 break-words text-sm font-semibold leading-5 text-foreground">
            {entry.anime.title}
          </strong>
          <div className="mt-auto flex min-h-6 items-center">
            {chip && label && (
              <Chip color={chip.color} variant={chip.variant} size="sm">
                <Chip.Label>{label}</Chip.Label>
              </Chip>
            )}
          </div>
        </Card.Content>
      </MediaCard>
    </Link>
  );
}

function readTimeZoneCookie() {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${TIME_ZONE_COOKIE}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}
