import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PageHeader, pageMainClass } from "@/components/catalog/page-header";
import { ScheduleBoard } from "@/components/schedule-board";
import { LocalTime } from "@/components/schedule-client";
import { TIME_ZONE_COOKIE } from "@/components/schedule-status";
import { apiFetch, type ScheduleResponse } from "@/lib/api/client";

export const dynamic = "force-dynamic";

const description =
  "Horario semanal estimado según las publicaciones recientes, en tu hora local.";

export const metadata: Metadata = {
  title: "Horario",
  description,
  alternates: { canonical: "/horario" },
  openGraph: {
    title: "Horario estimado · AnimeHub",
    description:
      "Consulta las publicaciones semanales estimadas en tu hora local.",
    url: "/horario",
    siteName: "AnimeHub",
    locale: "es_ES",
    type: "website",
  },
};

/** The viewer's IANA zone from the cookie the board sets, if it's valid. */
function cookieTimeZone(value: string | undefined) {
  if (!value || value.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(value))
    return null;
  try {
    new Intl.DateTimeFormat("es", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

export default async function SchedulePage() {
  const [response, cookieStore] = await Promise.all([
    apiFetch<ScheduleResponse>("/schedule"),
    cookies(),
  ]);
  const viewerZone = cookieTimeZone(cookieStore.get(TIME_ZONE_COOKIE)?.value);
  const serverTimeZone = viewerZone ?? "UTC";
  const serverNow = new Date().toISOString();

  return (
    <main id="contenido" tabIndex={-1} className={pageMainClass}>
      <PageHeader
        eyebrow="Esta semana"
        title="Horario"
        description={
          <>
            Estimado a partir de las publicaciones recientes, en tu hora local.{" "}
            <strong className="font-semibold text-subtle">
              Las horas son referenciales.
            </strong>
          </>
        }
        aside={
          <LocalTime
            serverNow={serverNow}
            serverTimeZone={serverTimeZone}
            zoneIsViewers={viewerZone !== null}
          />
        }
      />
      {response.meta.stale && (
        <p
          role="status"
          className="mb-6 rounded-xl border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          No se ha podido actualizar el horario. Se muestra la última
          información disponible.
        </p>
      )}
      <ScheduleBoard
        entries={response.data}
        stale={response.meta.stale}
        serverNow={serverNow}
        serverTimeZone={serverTimeZone}
      />
    </main>
  );
}
