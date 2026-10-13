"use client";

import {
  Drawer,
  Tooltip,
  Typography,
  type useOverlayState,
} from "@heroui/react";
import { useId, type ComponentProps } from "react";
import { LinksPanel, MyJdPanel, PreferencesPanel } from "./download-panels";

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
  /** What the drawer acts on ("One Piece · Ep. 5"), if anything. */
  summary: string | null;
  content: DownloadDrawerContent;
}) {
  const headingId = useId();
  return (
    <Drawer.Backdrop isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <Drawer.Content placement="right">
        <Drawer.Dialog aria-labelledby={headingId}>
          <Tooltip delay={300}>
            <Drawer.CloseTrigger aria-label="Cerrar" />
            <Tooltip.Content>Cerrar</Tooltip.Content>
          </Tooltip>
          <Drawer.Header>
            <Typography type="h3" id={headingId}>
              {title}
            </Typography>
            {summary && <p className="text-sm text-muted">{summary}</p>}
          </Drawer.Header>
          <Drawer.Body>
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
  );
}
