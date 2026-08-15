"use client";

import { Card, Chip, Tabs } from "@heroui/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { components } from "@/lib/api/generated";
import { AnimeImage } from "./anime-image";

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

const DAY_MS = 86_400_000;
type ReleaseStatus = "aired" | "delayed";

const statusMeta: Record<
  ReleaseStatus,
  { label: string; color: "success" | "warning" }
> = {
  aired: { label: "Emitido", color: "success" },
  delayed: { label: "Retrasado", color: "warning" },
};

// The source /horario only gives us each series' latest episode date, so — like
// animeav1 itself — the status is derived from that emission date, not a flag:
// - "aired" (Emitido) = this week's episode already emitted TODAY (emission-based,
//   not clock-based); it drops once the day passes.
// - "delayed" (Retrasado) = the weekly slot passed (>7 days since the last episode)
//   and the new one hasn't emitted yet.
// - otherwise no chip.
function getReleaseStatus(
  basisPublishedAt: string,
  now: Date,
): ReleaseStatus | null {
  const published = new Date(basisPublishedAt);
  if ((now.getTime() - published.getTime()) / DAY_MS > 7) return "delayed";
  if (published.toDateString() === now.toDateString()) return "aired";
  return null;
}

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

export function ScheduleBoard({ entries }: { entries: ScheduleEntry[] }) {
  // A single render-time clock drives both the default day and the per-entry
  // status derivation.
  const [now] = useState(() => new Date());
  const todayIndex = now.getDay();

  const grouped = useMemo(() => {
    const groups = Array.from({ length: 7 }, () => [] as ScheduleEntry[]);
    for (const entry of entries)
      groups[new Date(entry.basisPublishedAt).getDay()].push(entry);
    groups.forEach((group) =>
      group.sort(
        (a, b) =>
          slotMinutes(a.basisPublishedAt) - slotMinutes(b.basisPublishedAt),
      ),
    );
    return groups;
  }, [entries]);

  return (
    <Tabs
      aria-label="Días de la semana"
      defaultSelectedKey={String(todayIndex)}
      className="w-full gap-0"
    >
      <Tabs.ListContainer className="mb-7 rounded-none bg-transparent">
        <Tabs.List
          aria-label="Días de la semana"
          className="min-w-max gap-1.5 bg-transparent p-0"
        >
          {days.map((day, index) => {
            const count = grouped[index].length;
            return (
              <Tabs.Tab
                id={String(index)}
                key={day}
                aria-label={`${day}, ${count} lanzamientos`}
                className="flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-sm text-[#8FA3B4] shadow-none transition-colors data-[hovered=true]:not-data-[selected=true]:bg-[#0B1621] data-[hovered=true]:not-data-[selected=true]:text-[#C4D2DE] data-[selected=true]:bg-[#16233A] data-[selected=true]:font-semibold data-[selected=true]:text-[#F3F8FC]"
              >
                <span className="capitalize">{daysShort[index]}</span>
                <span className="min-w-5 rounded-full bg-[#1B2C44] px-1.5 text-center text-[11px] font-semibold tabular-nums text-[#93A4B8]">
                  {count}
                </span>
                {index === todayIndex && (
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-[#30C8B0]"
                    title="hoy"
                  />
                )}
              </Tabs.Tab>
            );
          })}
        </Tabs.List>
      </Tabs.ListContainer>

      {days.map((day, index) => (
        <Tabs.Panel id={String(index)} key={day}>
          <div className="mb-4 flex items-baseline gap-2.5">
            <h2 className="font-(family-name:--font-display) text-xl font-semibold capitalize text-[#F3F8FC]">
              {day}
            </h2>
            <span className="text-xs text-[#8FA3B4]">
              {grouped[index].length}{" "}
              {grouped[index].length === 1 ? "lanzamiento" : "lanzamientos"}
            </span>
            {index === todayIndex && (
              <span className="ml-auto flex items-center gap-1.5 text-[11px] text-[#69A7FF]">
                <span className="size-1.5 rounded-full bg-[#30C8B0]" />
                Hoy
              </span>
            )}
          </div>

          {grouped[index].length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-[#080F1B] py-16 text-center">
              <p className="text-sm text-[#8FA3B4]">
                Sin publicaciones observadas para este día.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-x-4 gap-y-6 max-xl:grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
              {grouped[index].map((entry) => {
                const status = getReleaseStatus(entry.basisPublishedAt, now);
                return (
                  <Link
                    href={`/anime/${entry.anime.slug}`}
                    className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#5B9CFF] focus-visible:ring-inset"
                    key={entry.anime.id}
                  >
                    <Card className="relative min-w-0 gap-0 overflow-hidden rounded-xl bg-[#0A1424] p-0 transition-shadow duration-300 group-hover:shadow-[0_18px_42px_rgba(0,0,0,.3)]">
                      <div className="relative aspect-video overflow-hidden bg-[#0A1220] [&_.anime-image_img]:transition-transform [&_.anime-image_img]:duration-700 [&_.anime-image_img]:ease-[cubic-bezier(.22,1,.36,1)] group-hover:[&_.anime-image_img]:scale-[1.04]">
                        <AnimeImage
                          src={entry.latestEpisode.imageUrl}
                          fallbackSrc={
                            entry.anime.backdropUrl ?? entry.anime.posterUrl
                          }
                          alt=""
                          sizes="(max-width: 680px) 90vw, (max-width: 1100px) 42vw, 22vw"
                        />
                        <time
                          className="absolute left-2 top-2 rounded-lg bg-[#050B15]/85 px-2 py-1 font-mono text-[11px] font-bold text-[#5FA8FF] backdrop-blur-sm"
                          dateTime={entry.basisPublishedAt}
                        >
                          {timeFormatter.format(
                            new Date(entry.basisPublishedAt),
                          )}
                        </time>
                        <div className="absolute bottom-0 left-0 flex h-6 items-center rounded-tr-lg bg-[#0A1424] px-2.5 text-[10px] font-bold">
                          <span className="tracking-[.12em] text-[#69A7FF]">
                            EP
                          </span>
                          <strong className="ml-1 tabular-nums text-[#F3F8FC]">
                            {entry.latestEpisode.number}
                          </strong>
                        </div>
                      </div>
                      <Card.Content className="flex flex-col gap-2 px-3.5 py-3">
                        <strong className="truncate text-sm font-semibold text-[#F3F8FC]">
                          {entry.anime.title}
                        </strong>
                        <div className="flex min-h-6 items-center justify-between gap-2">
                          <small className="truncate text-xs text-[#8FA3B4]">
                            Último: episodio {entry.latestEpisode.number}
                          </small>
                          {status && (
                            <Chip
                              color={statusMeta[status].color}
                              variant="soft"
                              size="sm"
                              className="shrink-0"
                            >
                              <Chip.Label>
                                {statusMeta[status].label}
                              </Chip.Label>
                            </Chip>
                          )}
                        </div>
                      </Card.Content>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
