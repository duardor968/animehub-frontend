"use client";

import { Tabs } from "@heroui/react";
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

export function ScheduleBoard({ entries }: { entries: ScheduleEntry[] }) {
  const today = new Date().getDay();
  const [selected, setSelected] = useState(today);
  const grouped = useMemo(() => {
    const groups = Array.from({ length: 7 }, () => [] as ScheduleEntry[]);
    for (const entry of entries)
      groups[new Date(entry.basisPublishedAt).getDay()].push(entry);
    groups.forEach((group) =>
      group.sort(
        (a, b) =>
          new Date(a.basisPublishedAt).getTime() -
          new Date(b.basisPublishedAt).getTime(),
      ),
    );
    return groups;
  }, [entries]);
  return (
    <div>
      <Tabs
        aria-label="Días de la semana"
        selectedKey={String(selected)}
        onSelectionChange={(key) => setSelected(Number(key))}
        className="w-full"
      >
        <Tabs.ListContainer className="mb-6 overflow-x-auto border-b border-white/8">
          <Tabs.List className="min-w-max gap-1 bg-transparent p-0">
            {days.map((day, index) => (
              <Tabs.Tab
                id={String(index)}
                key={day}
                className="min-h-12 min-w-24 rounded-none border-b-2 border-transparent px-4 text-sm capitalize text-[#8FA3B4] data-[selected=true]:border-[#2F81F7] data-[selected=true]:text-[#F3F8FC]"
              >
                {day}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>
      <div
        className="divide-y divide-white/8 border-y border-white/8"
        role="tabpanel"
      >
        {grouped[selected].map((entry) => (
          <Link
            href={`/anime/${entry.anime.slug}`}
            className="grid min-h-24 grid-cols-[72px_128px_1fr] items-center gap-5 py-3 text-[#F3F8FC] transition-colors hover:bg-[#0B1621]/55 focus-visible:bg-[#0B1621]/55 focus-visible:outline-none max-sm:grid-cols-[56px_88px_1fr] max-sm:gap-3"
            key={entry.anime.id}
          >
            <time
              className="font-mono text-sm font-semibold text-[#5FA8FF]"
              dateTime={entry.basisPublishedAt}
            >
              {new Intl.DateTimeFormat("es", {
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(entry.basisPublishedAt))}
            </time>
            <div className="relative aspect-video overflow-hidden rounded-md bg-[#0B1621]">
              <AnimeImage
                src={entry.latestEpisode.imageUrl}
                fallbackSrc={entry.anime.backdropUrl ?? entry.anime.posterUrl}
                alt=""
                sizes="120px"
              />
            </div>
            <span className="min-w-0">
              <strong className="block truncate text-sm font-semibold">
                {entry.anime.title}
              </strong>
              <small className="mt-1 block text-xs text-[#8FA3B4]">
                Último: episodio {entry.latestEpisode.number}
              </small>
            </span>
          </Link>
        ))}
        {grouped[selected].length === 0 && (
          <p className="py-16 text-center text-sm text-[#8FA3B4]">
            Sin publicaciones observadas para este día.
          </p>
        )}
      </div>
    </div>
  );
}
