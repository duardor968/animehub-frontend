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
} from "react";
import type { components } from "@/lib/api/generated";
import { AnimeImage } from "./anime-image";
import { MediaCard } from "./media-card";
import { deriveScheduleEntry } from "./schedule-status";

type ScheduleEntry = components["schemas"]["ScheduleEntryDto"];

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

// Slot time-of-day (minutes since midnight) — the schedule is ordered by the hour
// a series airs, independent of which calendar day the last episode landed on.
function slotMinutes(basisPublishedAt: string): number {
  const d = new Date(basisPublishedAt);
  return d.getHours() * 60 + d.getMinutes();
}

const timeFormatter = new Intl.DateTimeFormat("es", {
  hour: "2-digit",
  minute: "2-digit",
});

// Don't re-run the server component more than this often when the tab regains
// focus, so quick tab-switching never hammers the API.
const REVALIDATE_THROTTLE_MS = 30_000;

const subscribeHydration = () => () => {};
const getHydratedSnapshot = () => true;
const getServerSnapshot = () => false;

function ScheduleBoardPlaceholder() {
  return (
    <div aria-hidden="true" className="w-full">
      <div className="mb-7 flex min-h-11 gap-1 overflow-hidden border-b border-white/8">
        {weekOrder.map((index) => (
          <span
            className="flex min-h-11 min-w-16 items-center justify-center rounded-lg text-sm capitalize text-faint"
            key={daysShort[index]}
          >
            {daysShort[index]}
          </span>
        ))}
      </div>
      <div className="mb-4 h-7 w-32 animate-pulse rounded-lg bg-white/6 motion-reduce:animate-none" />
      <div className="grid grid-cols-5 gap-x-4 gap-y-7 max-xl:grid-cols-4 max-lg:grid-cols-3 max-sm:grid-cols-2">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            className="aspect-[2/3] animate-pulse rounded-xl bg-surface motion-reduce:animate-none"
            key={index}
          />
        ))}
      </div>
    </div>
  );
}

export function ScheduleBoard({
  entries,
  stale = false,
}: {
  entries: ScheduleEntry[];
  stale?: boolean;
}) {
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    getHydratedSnapshot,
    getServerSnapshot,
  );

  if (!hydrated) return <ScheduleBoardPlaceholder />;
  return <HydratedScheduleBoard entries={entries} stale={stale} />;
}

function HydratedScheduleBoard({
  entries,
  stale,
}: {
  entries: ScheduleEntry[];
  stale: boolean;
}) {
  const router = useRouter();

  // Advance local-day visibility even when the page remains open at midnight.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const todayIndex = now.getDay();

  // Publication needs new data, including while the user leaves this tab open.
  const lastRevalidatedAt = useRef(0);
  useEffect(() => {
    // Baseline the throttle at mount (an effect may read the clock; render may not),
    // so a focus event firing right after load doesn't trigger an immediate refetch.
    lastRevalidatedAt.current = Date.now();
    const revalidate = () => {
      if (document.visibilityState !== "visible") return;
      setNow(new Date());
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

  const grouped = useMemo(() => {
    const groups = Array.from(
      { length: 7 },
      () =>
        [] as Array<
          ScheduleEntry & {
            display: NonNullable<ReturnType<typeof deriveScheduleEntry>>;
          }
        >,
    );
    for (const entry of entries) {
      const display = deriveScheduleEntry(entry, now, stale);
      if (display)
        groups[new Date(entry.basisPublishedAt).getDay()].push({
          ...entry,
          display,
        });
    }
    groups.forEach((group) =>
      group.sort(
        (a, b) =>
          slotMinutes(a.basisPublishedAt) - slotMinutes(b.basisPublishedAt),
      ),
    );
    return groups;
  }, [entries, now, stale]);

  return (
    <Tabs
      variant="secondary"
      aria-label="Días de la semana"
      defaultSelectedKey={String(todayIndex)}
      className="schedule-tabs w-full gap-0"
    >
      <Tabs.ListContainer className="schedule-tabs-list mb-7 bg-transparent">
        <Tabs.List
          aria-label="Días de la semana"
          className="min-w-max gap-1 border-white/8 bg-transparent"
        >
          {weekOrder.map((index) => {
            const day = days[index];
            const count = grouped[index].length;
            return (
              <Tabs.Tab
                id={String(index)}
                key={day}
                aria-label={`${day}, ${count} ${count === 1 ? "lanzamiento" : "lanzamientos"}`}
                className="flex min-h-11 items-center gap-2 px-3 text-sm text-muted shadow-none transition-colors data-[hovered=true]:text-subtle data-[selected=true]:font-semibold data-[selected=true]:text-foreground"
              >
                <span className="capitalize">{daysShort[index]}</span>
                <span className="text-xs tabular-nums text-faint">{count}</span>
                {index === todayIndex && (
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-success"
                    title="hoy"
                  />
                )}
                <Tabs.Indicator className="bg-accent" />
              </Tabs.Tab>
            );
          })}
        </Tabs.List>
      </Tabs.ListContainer>

      {weekOrder.map((index) => {
        const day = days[index];
        return (
          <Tabs.Panel id={String(index)} key={day}>
            <div className="mb-4 flex items-baseline gap-2.5">
              <h2 className="font-(family-name:--font-display) text-xl font-semibold capitalize text-foreground">
                {day}
              </h2>
              <span className="text-xs text-muted">
                {grouped[index].length}{" "}
                {grouped[index].length === 1 ? "lanzamiento" : "lanzamientos"}
              </span>
            </div>

            {grouped[index].length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-surface py-16 text-center">
                <p className="text-sm text-muted">
                  No hay emisiones programadas para este día.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-x-4 gap-y-7 max-xl:grid-cols-4 max-lg:grid-cols-3 max-sm:grid-cols-2">
                {grouped[index].map((entry, entryIndex) => {
                  const { status, number } = entry.display;
                  return (
                    <Link
                      href={`/anime/${entry.anime.slug}`}
                      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
                      key={entry.anime.id}
                    >
                      <MediaCard className="touch-card relative min-w-0 gap-0 rounded-xl bg-surface p-0 transition-shadow duration-300 group-hover:shadow-[0_18px_42px_rgba(0,0,0,.3)]">
                        <div className="touch-static-media relative aspect-[2/3] overflow-hidden bg-surface [&_.anime-image_img]:transition-transform [&_.anime-image_img]:duration-700 [&_.anime-image_img]:ease-[cubic-bezier(.22,1,.36,1)] group-hover:[&_.anime-image_img]:scale-[1.04]">
                          <AnimeImage
                            src={entry.anime.posterUrl}
                            fallbackSrc={entry.anime.backdropUrl}
                            alt={`Póster de ${entry.anime.title}`}
                            priority={entryIndex < 5}
                            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 18vw"
                          />
                          <time
                            className="absolute left-2 top-2 rounded-lg bg-background-secondary/85 px-2 py-1 font-mono text-[11px] font-bold text-link backdrop-blur-sm"
                            dateTime={entry.basisPublishedAt}
                          >
                            {timeFormatter.format(
                              new Date(entry.basisPublishedAt),
                            )}
                          </time>
                          <div className="absolute bottom-0 left-0 flex h-6 items-center rounded-tr-lg bg-surface px-2.5 text-[10px] font-bold">
                            <span className="tracking-[.12em] text-link">
                              EP
                            </span>
                            <strong className="ml-1 tabular-nums text-foreground">
                              {number}
                            </strong>
                          </div>
                        </div>
                        <Card.Content className="flex flex-col gap-2 px-3.5 py-3">
                          <strong className="truncate text-sm font-semibold text-foreground">
                            {entry.anime.title}
                          </strong>
                          {status === "delayed" ? (
                            <Chip color="warning" variant="soft" size="sm">
                              <Chip.Label>Retrasado</Chip.Label>
                            </Chip>
                          ) : status === "aired" ? (
                            <Chip color="success" variant="soft" size="sm">
                              <Chip.Label>Emitido</Chip.Label>
                            </Chip>
                          ) : status === "finished" ? (
                            <Chip color="success" variant="soft" size="sm">
                              <Chip.Label>Finalizado</Chip.Label>
                            </Chip>
                          ) : status === "upcoming" ? (
                            <Chip color="accent" variant="soft" size="sm">
                              <Chip.Label>Próximo</Chip.Label>
                            </Chip>
                          ) : null}
                        </Card.Content>
                      </MediaCard>
                    </Link>
                  );
                })}
              </div>
            )}
          </Tabs.Panel>
        );
      })}
    </Tabs>
  );
}
