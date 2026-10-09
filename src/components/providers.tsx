"use client";

import {
  I18nProvider,
  Spinner,
  Toast,
  type ToastContentValue,
} from "@heroui/react";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import type { QueuedToast } from "react-aria-components/Toast";
import { DownloadProvider } from "./downloads/download-provider";

/**
 * Locale for React Aria / HeroUI built-ins (toast region label, dismiss
 * buttons, number and date formatting). Fixed so server and client render the
 * same strings regardless of the browser language.
 */
export const APP_LOCALE = "es-ES";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale={APP_LOCALE}>
      {/* The z-index sits above the drawer backdrop (z-60) / dialog (z-70) so a
          toast stays readable over the dimmed overlay. The bottom offset clears
          the mobile navigation (below lg) and the download dock (episode
          selection bar) while it is shown. */}
      <Toast.Provider
        placement="bottom end"
        width="min(26rem, calc(100vw - 2rem))"
        className="animehub-toast-region !z-[100] bottom-[calc(var(--bottom-nav-clearance)+1rem+var(--download-dock-height,0px))]"
      >
        {({ toast }) => <AppToast toast={toast} />}
      </Toast.Provider>
      <DownloadProvider>{children}</DownloadProvider>
    </I18nProvider>
  );
}

/**
 * HeroUI's default toast layout, with Spanish labels and a dismiss button that
 * stays visible (HeroUI only reveals its 20px "Close" button on hover, which
 * touch screens never trigger).
 */
function AppToast({ toast }: { toast: QueuedToast<ToastContentValue> }) {
  const { actionProps, description, indicator, isLoading, title, variant } =
    toast.content ?? {};
  return (
    <Toast toast={toast} variant={variant}>
      {indicator === null ? null : (
        <Toast.Indicator variant={variant}>
          {isLoading ? (
            <Spinner aria-hidden="true" color="current" size="sm" />
          ) : (
            indicator
          )}
        </Toast.Indicator>
      )}
      <Toast.Content>
        {title ? <Toast.Title>{title}</Toast.Title> : null}
        {description ? (
          <Toast.Description>{description}</Toast.Description>
        ) : null}
        {actionProps?.children ? (
          <Toast.ActionButton {...actionProps}>
            {actionProps.children}
          </Toast.ActionButton>
        ) : null}
      </Toast.Content>
      <Toast.CloseButton aria-label="Cerrar notificación">
        <X aria-hidden="true" size={16} />
      </Toast.CloseButton>
    </Toast>
  );
}
