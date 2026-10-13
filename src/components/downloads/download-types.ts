export type AudioPreference = "SUB" | "DUB";
export type DownloadProviderId =
  "MEGA" | "PIXELDRAIN" | "MP4UPLOAD" | "ONE_FICHIER";
/** Where resolved links go: Click'n'Load (local JDownloader), a MyJDownloader
 *  device, or the clipboard (works everywhere, including phones). */
export type DownloadDestination = "CNL" | "MYJD" | "COPY";

/** Every provider, in the order the UI lists them. */
export const providerLabels: Record<DownloadProviderId, string> = {
  MEGA: "Mega",
  PIXELDRAIN: "Pixeldrain",
  MP4UPLOAD: "MP4Upload",
  ONE_FICHIER: "1Fichier",
};

export interface DownloadPreferences {
  audio: AudioPreference;
  providers: DownloadProviderId[];
  destination: DownloadDestination;
}

export type DownloadActivityStatus =
  | "resolving"
  | "processing"
  | "ready"
  | "sending"
  | "handed-off"
  | "waiting-device"
  | "partial"
  | "error"
  | "cancelled";

export interface DownloadRequest {
  slug: string;
  title: string;
  episodeNumbers?: number[];
  all?: boolean;
  from?: number;
  to?: number;
  /** Known episode count for an `all` request, used only for copy. */
  total?: number;
  /** The anime's only video (a movie): its title alone names it. */
  movie?: boolean;
  /** Ask the API to re-scrape instead of reusing cached links (retries). */
  refresh?: boolean;
}
