import type { DownloadRequest } from "./download-types";

export const activeDownloadJobsStorageKey = "animehub.download-jobs.v1";

const schemaVersion = 1;
const maxStoredJobs = 8;
const maxReceiptLifetimeMs = 25 * 60 * 60_000;
const allowedClockSkewMs = 5 * 60_000;

export interface PersistedDownloadJob {
  id: string;
  request: DownloadRequest;
  receipt: {
    jobId: string;
    accessToken: string;
    expiresAt: string;
  };
  destination: "CNL" | "MYJD";
  createdAt: number;
  current: number;
  total: number;
  deliveryAttempted: boolean;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : null;
}

function nonNegativeInteger(value: unknown, max: number) {
  return Number.isSafeInteger(value) &&
    Number(value) >= 0 &&
    Number(value) <= max
    ? Number(value)
    : null;
}

function parseBackgroundRequest(value: unknown): DownloadRequest | null {
  if (!isRecord(value)) return null;
  const slug = boundedString(value.slug, 256);
  const title = boundedString(value.title, 500);
  if (!slug || !title) return null;

  if (value.all === true) return { slug, title, all: true };

  const from = nonNegativeInteger(value.from, 100_000);
  const to = nonNegativeInteger(value.to, 100_000);
  if (from === null || to === null || from > to) return null;
  return { slug, title, from, to };
}

function parseJob(value: unknown, now: number): PersistedDownloadJob | null {
  if (!isRecord(value) || !isRecord(value.receipt)) return null;
  const id = boundedString(value.id, 128);
  const request = parseBackgroundRequest(value.request);
  const jobId = boundedString(value.receipt.jobId, 128);
  const accessToken = boundedString(value.receipt.accessToken, 512);
  const expiresAt = boundedString(value.receipt.expiresAt, 64);
  const createdAt = nonNegativeInteger(
    value.createdAt,
    Number.MAX_SAFE_INTEGER,
  );
  const total = nonNegativeInteger(value.total, 100_000);
  const current = nonNegativeInteger(value.current, 100_000);
  const destination =
    value.destination === "CNL" || value.destination === "MYJD"
      ? value.destination
      : null;
  if (
    !id ||
    !request ||
    !jobId ||
    !accessToken ||
    !expiresAt ||
    createdAt === null ||
    total === null ||
    current === null ||
    !destination
  ) {
    return null;
  }

  const expiresAtMs = Date.parse(expiresAt);
  if (
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs <= now ||
    createdAt > now + allowedClockSkewMs ||
    expiresAtMs > createdAt + maxReceiptLifetimeMs
  ) {
    return null;
  }

  return {
    id,
    request,
    receipt: { jobId, accessToken, expiresAt },
    destination,
    createdAt,
    current: Math.min(current, total),
    total,
    // Older v1 receipts did not record this flag. Missing means no delivery
    // attempt was observed, which keeps existing sessions backwards-compatible.
    deliveryAttempted: value.deliveryAttempted === true,
  };
}

function normalizeJobs(values: unknown[], now: number) {
  const seenIds = new Set<string>();
  const seenJobIds = new Set<string>();
  return values
    .map((value) => parseJob(value, now))
    .filter((job): job is PersistedDownloadJob => job !== null)
    .sort((left, right) => right.createdAt - left.createdAt)
    .filter((job): job is PersistedDownloadJob => {
      if (seenIds.has(job.id) || seenJobIds.has(job.receipt.jobId))
        return false;
      seenIds.add(job.id);
      seenJobIds.add(job.receipt.jobId);
      return true;
    })
    .slice(0, maxStoredJobs);
}

export function loadActiveDownloadJobs(storage: StorageLike, now = Date.now()) {
  try {
    const raw = storage.getItem(activeDownloadJobsStorageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.version !== schemaVersion ||
      !Array.isArray(parsed.jobs)
    ) {
      storage.removeItem(activeDownloadJobsStorageKey);
      return [];
    }
    const jobs = normalizeJobs(parsed.jobs, now);
    saveActiveDownloadJobs(storage, jobs, now);
    return jobs;
  } catch {
    try {
      storage.removeItem(activeDownloadJobsStorageKey);
    } catch {
      // A blocked sessionStorage must not break downloads in the current tab.
    }
    return [];
  }
}

export function saveActiveDownloadJobs(
  storage: StorageLike,
  jobs: PersistedDownloadJob[],
  now = Date.now(),
) {
  try {
    const normalized = normalizeJobs(jobs, now);
    if (normalized.length === 0) {
      storage.removeItem(activeDownloadJobsStorageKey);
      return;
    }
    storage.setItem(
      activeDownloadJobsStorageKey,
      JSON.stringify({ version: schemaVersion, jobs: normalized }),
    );
  } catch {
    // Persistence is best effort; the live React state remains authoritative.
  }
}
