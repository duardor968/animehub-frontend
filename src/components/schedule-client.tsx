"use client";

import { toast } from "@heroui/react";
import { useEffect, useSyncExternalStore } from "react";

const timeFormatter = new Intl.DateTimeFormat("es", {
  hour: "2-digit",
  minute: "2-digit",
});

function subscribeMinute(onChange: () => void) {
  const id = window.setInterval(onChange, 30_000);
  return () => window.clearInterval(id);
}

// Shows the viewer's own local time so any offset from the source's stated hours
// is obvious at a glance. useSyncExternalStore keeps it client-only (server
// snapshot is null → no hydration mismatch) without setState-in-effect.
export function LocalTime() {
  const time = useSyncExternalStore(
    subscribeMinute,
    () => timeFormatter.format(new Date()),
    () => null,
  );
  return (
    <span className="inline-flex items-center gap-2 text-sm text-[#93A4B8]">
      <span className="text-[10px] font-bold uppercase tracking-[.16em] text-[#5C6E82]">
        Hora local
      </span>
      <strong className="tabular-nums text-[#F3F8FC]">{time ?? "--:--"}</strong>
    </span>
  );
}

const NOTICE_KEY = "animehub.schedule-notice-seen";

// One-time persistent warning that the schedule is referential. Replaces the
// always-on banner: shown once per browser, then remembered.
export function ScheduleNotice() {
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(NOTICE_KEY) === "1";
      if (!seen) localStorage.setItem(NOTICE_KEY, "1");
    } catch {
      // Private mode / storage blocked: fall through and show it this session.
    }
    if (seen) return;
    toast.warning("Horarios referenciales", {
      description:
        "Los horarios que se muestran aquí son referenciales y pueden variar.",
      timeout: 0,
    });
  }, []);
  return null;
}
