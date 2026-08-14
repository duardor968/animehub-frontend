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
      <Toast.Provider
        placement="bottom end"
        width="min(26rem, calc(100vw - 2rem))"
        className="max-sm:!bottom-24"
      />
      <DownloadProvider>{children}</DownloadProvider>
    </QueryClientProvider>
  );
}
