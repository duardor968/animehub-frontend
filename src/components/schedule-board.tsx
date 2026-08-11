"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { components } from "@/lib/api/generated";

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
    <div className="schedule-board">
      <div className="day-tabs" role="tablist" aria-label="Días de la semana">
        {days.map((day, index) => (
          <button
            role="tab"
            aria-selected={selected === index}
            key={day}
            onClick={() => setSelected(index)}
          >
            {day.slice(0, 3)}
          </button>
        ))}
      </div>
      <div className="schedule-list" role="tabpanel">
        {grouped[selected].map((entry) => (
          <Link
            href={`/anime/${entry.anime.slug}`}
            className="schedule-row"
            key={entry.anime.id}
          >
            <time dateTime={entry.basisPublishedAt}>
              {new Intl.DateTimeFormat("es", {
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(entry.basisPublishedAt))}
            </time>
            <span>
              <strong>{entry.anime.title}</strong>
              <small>Último: episodio {entry.latestEpisode.number}</small>
            </span>
          </Link>
        ))}
        {grouped[selected].length === 0 && (
          <p className="empty-copy">
            Sin publicaciones observadas para este día.
          </p>
        )}
      </div>
    </div>
  );
}
