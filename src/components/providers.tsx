"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toast } from "@heroui/react";
import { useState, type ReactNode } from "react";
import { DownloadProvider } from "./downloads/download-provider";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      {/* Bottom-right by default; the z-index sits above the drawer backdrop
          (z-60) / dialog (z-70) so that when the download drawer is open the toast
          renders on top of the dimmed overlay instead of behind it. */}
      <Toast.Provider
        placement="bottom end"
        width="min(26rem, calc(100vw - 2rem))"
        className="!z-[100] max-sm:!bottom-24"
      />
      <DownloadProvider>{children}</DownloadProvider>
    </QueryClientProvider>
  );
}
