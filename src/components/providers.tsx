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
      {/* Placement over drawers and above the download dock: globals.css. */}
      <Toast.Provider
        placement="bottom end"
        width="min(26rem, calc(100vw - 2rem))"
        className="animehub-toast-region"
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
            // Decorative (the title says what is loading); the label only
            // replaces HeroUI's English default "Loading".
            <Spinner
              aria-hidden="true"
              aria-label="Cargando"
              color="current"
              size="sm"
            />
          ) : (
            indicator
          )}
        </Toast.Indicator>
      )}
      {/* min-w-0 + stretch: long titles wrap inside the toast instead of
          widening it, so the dismiss button never leaves the screen. */}
      <Toast.Content className="min-w-0 flex-1 items-stretch">
        {title ? (
          <Toast.Title className="wrap-anywhere">{title}</Toast.Title>
        ) : null}
        {description ? (
          // A div: download toasts put blocks (progress, actions) in it.
          <Toast.Description
            elementType="div"
            className="min-w-0 wrap-anywhere"
          >
            {description}
          </Toast.Description>
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
