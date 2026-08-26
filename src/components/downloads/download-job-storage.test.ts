import { describe, expect, it } from "vitest";
import {
  activeDownloadJobsStorageKey,
  loadActiveDownloadJobs,
  saveActiveDownloadJobs,
  type PersistedDownloadJob,
} from "./download-job-storage";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const now = Date.parse("2026-08-26T18:00:00.000Z");

function job(overrides: Partial<PersistedDownloadJob> = {}) {
  return {
    id: "activity-1",
    request: {
      slug: "otome-game-sekai-2",
      title: "Otome Game Sekai 2",
      from: 1,
      to: 12,
    },
    receipt: {
      jobId: "job-1",
      accessToken: "bearer-capability",
      expiresAt: new Date(now + 60 * 60_000).toISOString(),
    },
    destination: "CNL" as const,
    createdAt: now - 1_000,
    current: 3,
    total: 12,
    deliveryAttempted: false,
    ...overrides,
  } satisfies PersistedDownloadJob;
}

describe("active download job storage", () => {
  it("round-trips only the resumable receipt and request fields", () => {
    const storage = new MemoryStorage();
    const unsafe = {
      ...job(),
      episodes: [{ links: [{ url: "https://resolved.example/file" }] }],
      email: "private@example.com",
      password: "secret",
    } as PersistedDownloadJob;

    saveActiveDownloadJobs(storage, [unsafe], now);

    const raw = storage.getItem(activeDownloadJobsStorageKey);
    expect(raw).not.toContain("resolved.example");
    expect(raw).not.toContain("private@example.com");
    expect(raw).not.toContain("secret");
    expect(loadActiveDownloadJobs(storage, now)).toEqual([job()]);
  });

  it("remembers an ambiguous delivery attempt without persisting resolved links", () => {
    const storage = new MemoryStorage();
    saveActiveDownloadJobs(storage, [job({ deliveryAttempted: true })], now);

    expect(loadActiveDownloadJobs(storage, now)[0]?.deliveryAttempted).toBe(
      true,
    );
  });

  it("drops expired, implausibly long, and non-background receipts", () => {
    const storage = new MemoryStorage();
    saveActiveDownloadJobs(
      storage,
      [
        job({
          id: "expired",
          receipt: {
            ...job().receipt,
            jobId: "expired-job",
            expiresAt: new Date(now - 1).toISOString(),
          },
        }),
        job({
          id: "too-long",
          receipt: {
            ...job().receipt,
            jobId: "too-long-job",
            expiresAt: new Date(now + 26 * 60 * 60_000).toISOString(),
          },
        }),
        job({
          id: "single",
          request: {
            slug: "otome-game-sekai-2",
            title: "Otome Game Sekai 2",
            episodeNumbers: [8],
          },
          receipt: { ...job().receipt, jobId: "single-job" },
        }),
      ],
      now,
    );

    expect(storage.getItem(activeDownloadJobsStorageKey)).toBeNull();
  });

  it("deduplicates and bounds the collection to the eight newest jobs", () => {
    const storage = new MemoryStorage();
    const jobs = Array.from({ length: 10 }, (_, index) =>
      job({
        id: `activity-${index}`,
        receipt: { ...job().receipt, jobId: `job-${index}` },
        createdAt: now - index * 1_000,
      }),
    );
    jobs.push({
      ...jobs[0],
      id: "duplicate-job-id",
      createdAt: now + 1,
    });

    saveActiveDownloadJobs(storage, jobs, now);

    const restored = loadActiveDownloadJobs(storage, now);
    expect(restored).toHaveLength(8);
    expect(new Set(restored.map((entry) => entry.receipt.jobId)).size).toBe(8);
    expect(restored.map((entry) => entry.id)).toContain("duplicate-job-id");
    expect(restored.map((entry) => entry.id)).not.toContain("activity-0");
    expect(restored.at(-1)?.id).toBe("activity-7");
  });

  it("clears corrupt or unknown schema versions without throwing", () => {
    const storage = new MemoryStorage();
    storage.setItem(activeDownloadJobsStorageKey, "{not-json");
    expect(loadActiveDownloadJobs(storage, now)).toEqual([]);
    expect(storage.getItem(activeDownloadJobsStorageKey)).toBeNull();

    storage.setItem(
      activeDownloadJobsStorageKey,
      JSON.stringify({ version: 99, jobs: [job()] }),
    );
    expect(loadActiveDownloadJobs(storage, now)).toEqual([]);
    expect(storage.getItem(activeDownloadJobsStorageKey)).toBeNull();
  });
});
