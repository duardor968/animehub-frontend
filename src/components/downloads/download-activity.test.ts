import { describe, expect, it } from "vitest";
import {
  deliverableEpisodes,
  presentActivity,
  type Activity,
} from "./download-activity";

const activity = (overrides: Partial<Activity> = {}): Activity => ({
  id: "a",
  key: "k",
  request: {
    slug: "tensei-goblin",
    title: "Tensei Goblin",
    episodeNumbers: [1],
  },
  status: "handed-off",
  current: 1,
  total: 1,
  packageName: "Tensei Goblin",
  episodes: [
    {
      episodeNumber: 1,
      audio: "SUB",
      links: [{ provider: "MEGA", url: "https://mega.example/1" }],
    },
  ],
  destination: "CNL",
  deliveredVia: "CNL",
  preferredAudio: "SUB",
  createdAt: 0,
  isJob: false,
  ...overrides,
});

describe("deliverableEpisodes", () => {
  const links = [
    { provider: "MEGA" as const, url: "https://mega.example/1" },
    { provider: "TRANSFERIT" as const, url: "https://transfer.example/1" },
  ];
  const withTransfer = (overrides: Partial<Activity> = {}) =>
    activity({
      status: "ready",
      episodes: [{ episodeNumber: 1, audio: "SUB", links }],
      ...overrides,
    });

  it("sends no Transfer.it link to a JDownloader", () => {
    expect(deliverableEpisodes(withTransfer())[0].links).toEqual([links[0]]);
    expect(presentActivity(withTransfer(), { portable: false }).title).toBe(
      "1 enlace listo",
    );
  });

  it("offers a copy when only Transfer.it has links", () => {
    const view = presentActivity(
      withTransfer({
        status: "error",
        noLinks: true,
        episodes: [{ episodeNumber: 1, audio: "SUB", links: [links[1]] }],
      }),
      { portable: false },
    );
    expect(view).toMatchObject({
      title: "Solo hay enlaces de Transfer.it",
      detail: "No se envían a JDownloader.",
      actions: [{ id: "copy", label: "Copiar enlaces", primary: true }],
    });
  });

  it("counts what went the way it went", () => {
    const sent = (deliveredVia: "CNL" | "COPY") =>
      presentActivity(withTransfer({ status: "handed-off", deliveredVia }), {
        portable: false,
      }).title;
    expect(sent("CNL")).toBe("1 enlace enviado a JDownloader");
    // Sent to Click'n'Load first, copied in the end: Transfer.it went too.
    expect(sent("COPY")).toBe("2 enlaces copiados");
  });

  it("copies every link", () => {
    expect(deliverableEpisodes(withTransfer(), "COPY")[0].links).toEqual(links);
    expect(
      deliverableEpisodes(withTransfer({ destination: "COPY" }))[0].links,
    ).toEqual(links);
  });
});

describe("presentActivity copy", () => {
  it("agrees with a single link", () => {
    expect(presentActivity(activity(), { portable: false })).toMatchObject({
      title: "1 enlace enviado a JDownloader",
      detail: undefined,
    });
    expect(
      presentActivity(activity({ status: "ready", copyBlocked: true }), {
        portable: false,
      }),
    ).toMatchObject({
      title: "1 enlace listo para copiar",
      detail: "El navegador no permitió copiarlo automáticamente.",
    });
  });

  it("formats progress counts and offers no retry for invalid requests", () => {
    const processing = presentActivity(
      activity({ status: "processing", current: 20, total: 1180, isJob: true }),
      { portable: false },
    );
    expect(processing.progress).toEqual({ current: 20, total: 1180 });
    const rejected = presentActivity(
      activity({
        status: "error",
        retryable: false,
        failure: { title: "Solicitud no válida", detail: "…" },
      }),
      { portable: false },
    );
    expect(rejected.actions).toEqual([]);
  });

  it("states results once, without instructions", () => {
    const copied = presentActivity(activity({ deliveredVia: "COPY" }), {
      portable: false,
    });
    expect(copied).toMatchObject({
      title: "1 enlace copiado",
      detail: undefined,
    });
    expect(
      presentActivity(activity({ status: "ready" }), { portable: false }).title,
    ).toBe("1 enlace listo");
    expect(
      presentActivity(activity({ status: "waiting-device" }), {
        portable: false,
      }).detail,
    ).toBeUndefined();
  });

  it("names the provider of a single-provider copy", () => {
    expect(
      presentActivity(activity({ deliveredVia: "COPY", provider: "MEGA" }), {
        portable: false,
      }).title,
    ).toBe("1 enlace de Mega copiado");
  });
});
