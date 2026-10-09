"use client";

import { Drawer, type useOverlayState } from "@heroui/react";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import {
  DrawerSummary,
  LinksPanel,
  MyJdPanel,
  PreferencesPanel,
} from "./download-panels";

export type DownloadDrawerContent =
  | { mode: "settings"; props: ComponentProps<typeof PreferencesPanel> }
  | { mode: "links"; props: ComponentProps<typeof LinksPanel> }
  | { mode: "devices"; props: ComponentProps<typeof MyJdPanel> };

/**
 * The download drawer (preferences, MyJDownloader devices, copyable links).
 * DownloadProvider loads it on demand the first time it opens, so its code
 * and the form components it uses stay out of every page's initial bundle.
 */
export function DownloadDrawer({
  state,
  title,
  summary,
  content,
}: {
  state: ReturnType<typeof useOverlayState>;
  title: string;
  summary: string | null;
  content: DownloadDrawerContent;
}) {
  return (
    <Drawer state={state}>
      <Drawer.Trigger className="drawer-state-trigger" aria-hidden="true">
        Abrir descargas
      </Drawer.Trigger>
      {/* Same dim backdrop as the catalog filters (no blur: cheaper on
          phones, and one look for both drawers). */}
      <Drawer.Backdrop
        variant="transparent"
        className="download-drawer-backdrop z-[60] !bg-background/76"
      >
        <Drawer.Content
          placement="right"
          className="download-drawer-content z-[70]"
        >
          <Drawer.Dialog className="download-drawer-dialog !w-full !max-w-md overflow-hidden border-l border-white/10 bg-background-secondary !p-0 text-foreground">
            <Drawer.Header className="download-drawer-header flex shrink-0 flex-row items-start justify-between gap-4 border-b border-white/8 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
              <div className="min-w-0">
                <span className="eyebrow">Descargas</span>
                <Drawer.Heading className="mt-1 font-display text-xl font-semibold tracking-[-.02em] text-foreground">
                  {title}
                </Drawer.Heading>
              </div>
              <Drawer.CloseTrigger
                className="static grid size-11 shrink-0 place-items-center rounded-xl text-muted outline-none transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus"
                aria-label="Cerrar"
              >
                <X size={18} aria-hidden="true" />
              </Drawer.CloseTrigger>
            </Drawer.Header>
            <Drawer.Body className="download-drawer-body mx-0 flex flex-col gap-4 px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <DrawerSummary
                label={content.mode === "links" ? "Enlaces de" : "Vas a enviar"}
                summary={summary}
              />
              {content.mode === "settings" ? (
                <PreferencesPanel {...content.props} />
              ) : content.mode === "links" ? (
                <LinksPanel {...content.props} />
              ) : (
                <MyJdPanel {...content.props} />
              )}
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
