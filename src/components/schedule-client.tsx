"use client";

import { useSyncExternalStore } from "react";
import { formatScheduleTime } from "./schedule-status";

function subscribeMinute(onChange: () => void) {
  let interval: number | undefined;
  // Tick on the minute boundary so the clock never lags behind the system's.
  const timeout = window.setTimeout(
    () => {
      onChange();
      interval = window.setInterval(onChange, 60_000);
    },
    60_000 - (Date.now() % 60_000) + 50,
  );
  return () => {
    window.clearTimeout(timeout);
    window.clearInterval(interval);
  };
}

const subscribeHydration = () => () => {};

// The viewer's own clock, so any offset from the stated hours is obvious at a
// glance. The server renders the same instant in the zone it grouped the week
// by; after hydration it follows the browser.
export function LocalTime({
  serverNow,
  serverTimeZone,
  zoneIsViewers,
}: {
  serverNow: string;
  serverTimeZone: string;
  /** The server zone came from the viewer's cookie (not the UTC fallback). */
  zoneIsViewers: boolean;
}) {
  const time = useSyncExternalStore(
    subscribeMinute,
    () => formatScheduleTime(new Date()),
    () => formatScheduleTime(new Date(serverNow), serverTimeZone),
  );
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  return (
    <p className="inline-flex items-center gap-2 text-sm text-muted">
      <span className="text-[11px] font-bold uppercase tracking-[.16em] text-faint">
        {hydrated || zoneIsViewers ? "Hora local" : "Hora UTC"}
      </span>
      <strong className="tabular-nums text-foreground">{time}</strong>
    </p>
  );
}
