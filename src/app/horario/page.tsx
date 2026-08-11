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
    <main className="page-shell">
      <div className="section-header enter">
        <div>
          <span className="eyebrow">Hora local</span>
          <h1>Horario estimado</h1>
          <p>
            Se calcula desde la publicación más reciente de cada serie. Puede
            variar.
          </p>
        </div>
      </div>
      <ScheduleBoard entries={response.data} />
    </main>
  );
}
