import { Alert } from "@heroui/react";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader, pageMainClass } from "@/components/page-header";
import { ScheduleBoard } from "@/components/schedule-board";
import { LocalTime } from "@/components/schedule-client";
import { daySlugs, TIME_ZONE_COOKIE } from "@/components/schedule-status";
import { apiFetch, type ScheduleResponse } from "@/lib/api/client";
import { MAIN_CONTENT_ID } from "@/lib/navigation";
import { siteName, siteOpenGraph } from "@/lib/site";

export const dynamic = "force-dynamic";

const description =
  "Horario semanal estimado según las publicaciones recientes, en tu hora local.";

export const metadata: Metadata = {
  title: "Horario",
  description,
  alternates: { canonical: "/horario" },
  openGraph: {
    ...siteOpenGraph,
    title: `Horario estimado · ${siteName}`,
    description:
      "Consulta las publicaciones semanales estimadas en tu hora local.",
    url: "/horario",
  },
};

/** A valid IANA zone name (from the board's cookie or a geo header). */
function validTimeZone(value: string | null | undefined) {
  if (!value || value.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(value))
    return null;
  try {
    new Intl.DateTimeFormat("es", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string | string[] }>;
}) {
  // An unknown `?dia=` (hand-edited or stale link) falls back to today.
  const { dia } = await searchParams;
  if (dia !== undefined && !daySlugs.includes(String(dia)))
    redirect("/horario");
  const [response, cookieStore, headerStore] = await Promise.all([
    apiFetch<ScheduleResponse>("/schedule"),
    cookies(),
    headers(),
  ]);
  // The board's cookie is the viewer's own zone. On a first visit, the edge's
  // geolocation guess (Cloudflare, Vercel) beats UTC; the board re-checks it.
  const viewerZone = validTimeZone(cookieStore.get(TIME_ZONE_COOKIE)?.value);
  const guessedZone = validTimeZone(
    headerStore.get("cf-timezone") ?? headerStore.get("x-vercel-ip-timezone"),
  );
  const serverTimeZone = viewerZone ?? guessedZone ?? "UTC";
  const zoneConfirmed = viewerZone !== null;
  const serverNow = new Date().toISOString();

  return (
    <main id={MAIN_CONTENT_ID} tabIndex={-1} className={pageMainClass}>
      <PageHeader
        title="Horario"
        aside={
          <LocalTime
            serverNow={serverNow}
            serverTimeZone={serverTimeZone}
            zoneIsViewers={zoneConfirmed || guessedZone !== null}
            zoneConfirmed={zoneConfirmed}
          />
        }
      />
      {response.meta.stale && (
        <Alert status="warning" className="mb-8">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>No se ha podido actualizar el horario</Alert.Title>
            <Alert.Description>
              Se muestra la última información disponible.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <ScheduleBoard
        entries={response.data}
        stale={response.meta.stale}
        serverNow={serverNow}
        serverTimeZone={serverTimeZone}
        zoneConfirmed={zoneConfirmed}
      />
    </main>
  );
}
