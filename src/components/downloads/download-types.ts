export type AudioPreference = "SUB" | "DUB";
export type DownloadProviderId =
  "MEGA" | "PIXELDRAIN" | "MP4UPLOAD" | "ONE_FICHIER";
export type DownloadDestination = "CNL" | "MYJD";

export interface DownloadPreferences {
  audio: AudioPreference;
  providers: DownloadProviderId[];
  destination: DownloadDestination;
  quickSend: boolean;
}

export interface DownloadRequest {
  slug: string;
  title: string;
  episodeNumbers?: number[];
  all?: boolean;
  from?: number;
  to?: number;
}
