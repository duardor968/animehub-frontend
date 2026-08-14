import type { Metadata } from "next";
import { ScheduleBoard } from "@/components/schedule-board";
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
      <div className="mb-8">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#2F81F7]">
            Hora local
          </span>
          <h1 className="mt-2 font-(family-name:--font-display) text-5xl font-semibold tracking-[-.04em] text-[#F3F8FC] max-sm:text-4xl">
            Horario
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#8FA3B4]">
            Se calcula desde la publicación más reciente de cada serie. Puede
            variar.
          </p>
        </div>
      </div>
      <ScheduleBoard entries={response.data} />
    </main>
  );
}
