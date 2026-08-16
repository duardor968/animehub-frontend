import type { Metadata } from "next";
import { ScheduleBoard } from "@/components/schedule-board";
import { LocalTime, ScheduleNotice } from "@/components/schedule-client";
import { apiFetch, type ScheduleResponse } from "@/lib/api/client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Horario",
  description: "Horario semanal estimado según publicaciones recientes.",
  alternates: { canonical: "/horario" },
  openGraph: {
    title: "Horario estimado · AnimeHub",
    description:
      "Consulta las publicaciones semanales estimadas en tu hora local.",
    url: "/horario",
  },
};

export default async function SchedulePage() {
  const response = await apiFetch<ScheduleResponse>("/schedule");
  return (
    <main className="mx-auto min-h-[70vh] w-full max-w-[1200px] px-6 py-12 max-sm:px-4 max-sm:pb-28 max-sm:pt-9">
      <ScheduleNotice />
      <div className="mb-8 flex items-end justify-between gap-4">
        <h1 className="font-(family-name:--font-display) text-5xl font-semibold tracking-[-.04em] text-[#F3F8FC] max-sm:text-4xl">
          Horario
        </h1>
        <LocalTime />
      </div>
      <ScheduleBoard entries={response.data} />
    </main>
  );
}
