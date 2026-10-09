import { describe, expect, it } from "vitest";
import { presentActivity, type Activity } from "./download-activity";

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

describe("presentActivity copy", () => {
  it("agrees with a single link", () => {
    expect(presentActivity(activity(), { portable: false }).detail).toBe(
      "1 enlace de 1 episodio enviado a JDownloader. Aparecerá en LinkGrabber.",
    );
    expect(
      presentActivity(activity({ status: "ready", copyBlocked: true }), {
        portable: false,
      }).detail,
    ).toBe(
      "1 enlace de 1 episodio. El navegador no permitió copiarlo automáticamente.",
    );
  });

  it("splits the summary so a long title can be truncated alone", () => {
    const view = presentActivity(activity(), { portable: false });
    expect(view.summary).toBe("Tensei Goblin · Ep. 1");
    expect([view.summaryTitle, view.summaryEpisodes]).toEqual([
      "Tensei Goblin",
      "Ep. 1",
    ]);
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
});
