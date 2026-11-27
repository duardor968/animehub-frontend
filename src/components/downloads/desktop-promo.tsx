"use client";

import { AlertDialog, Button, Card, Dropdown, Label } from "@heroui/react";
import { Check, ChevronDown, Download, Monitor } from "lucide-react";
import { useEffect, useState } from "react";
import {
  DESKTOP_RELEASE_FALLBACK,
  formatDesktopReleaseSubtitle,
  getCachedDesktopRelease,
  getDesktopRelease,
  markDesktopPromoSeen,
  openDesktopDownload,
  type DesktopReleaseInfo,
} from "./desktop-release";

const desktopBenefits = [
  "Cola integrada con pausado, reanudación y reintentos automáticos.",
  "Envía descargas desde el móvil vinculando tu PC en Preferencias.",
  "Se mantiene al día con actualizaciones automáticas.",
] as const;

function useDesktopRelease(enabled: boolean): DesktopReleaseInfo {
  const [release, setRelease] = useState<DesktopReleaseInfo>(
    () => getCachedDesktopRelease() ?? DESKTOP_RELEASE_FALLBACK,
  );

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void getDesktopRelease().then((info) => {
      if (active) setRelease(info);
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  return release;
}

export function DesktopDownloadButtons({
  release,
  size = "md",
  stacked = true,
  onDownload,
}: {
  release: DesktopReleaseInfo;
  size?: "sm" | "md";
  stacked?: boolean;
  onDownload?: () => void;
}) {
  const trigger = (url: string) => {
    onDownload?.();
    openDesktopDownload(url);
  };

  return (
    <div
      className={
        stacked ? "flex flex-col gap-2" : "flex flex-wrap items-center gap-2"
      }
    >
      <Button
        size={size}
        variant="primary"
        fullWidth={stacked}
        className={stacked ? undefined : "flex-1"}
        onPress={() => trigger(release.windowsUrl)}
      >
        <Download aria-hidden="true" />
        <span>Descargar para Windows</span>
      </Button>
      <Dropdown>
        <Button
          size={size}
          variant="secondary"
          fullWidth={stacked}
          className={
            stacked
              ? "[&[aria-expanded=true]]:transform-none!"
              : "flex-1 [&[aria-expanded=true]]:transform-none!"
          }
        >
          <Download aria-hidden="true" />
          <span>Descargar para Linux</span>
          <ChevronDown aria-hidden="true" />
        </Button>
        <Dropdown.Popover
          placement="bottom"
          className="w-max min-w-(--trigger-width) max-w-[calc(100vw-2rem)]"
        >
          <Dropdown.Menu
            aria-label="Paquetes para Linux"
            onAction={(key) => {
              if (key === "appimage") trigger(release.linuxAppImageUrl);
              else if (key === "deb") trigger(release.linuxDebUrl);
            }}
          >
            <Dropdown.Item id="appimage" textValue="AppImage (recomendado)">
              <Label className="whitespace-nowrap">
                AppImage (recomendado)
              </Label>
            </Dropdown.Item>
            <Dropdown.Item id="deb" textValue="Paquete .deb (Ubuntu / Debian)">
              <Label className="whitespace-nowrap">
                Paquete .deb (Ubuntu / Debian)
              </Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </div>
  );
}

export function DesktopPromoModal({
  isOpen,
  onOpenChange,
  onDownload,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onDownload?: () => void;
}) {
  const release = useDesktopRelease(isOpen);

  return (
    <AlertDialog.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) markDesktopPromoSeen();
        onOpenChange(open);
      }}
      isDismissable
      isKeyboardDismissDisabled={false}
    >
      <AlertDialog.Container size="md">
        <AlertDialog.Dialog className="pb-4">
          <AlertDialog.CloseTrigger aria-label="Cerrar" />
          <AlertDialog.Header>
            <div className="flex items-center gap-3 pe-8">
              <AlertDialog.Icon
                status="accent"
                className="bg-accent-soft text-link"
              >
                <Monitor aria-hidden="true" />
              </AlertDialog.Icon>
              <div className="min-w-0">
                <AlertDialog.Heading>AnimeHub para PC</AlertDialog.Heading>
                <p className="text-xs text-muted tabular-nums">
                  {formatDesktopReleaseSubtitle(release.version)}
                </p>
              </div>
            </div>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-subtle">
                Descarga episodios y series completas directamente en tu
                ordenador, sin copiar enlaces ni depender de JDownloader.
              </p>
              <ul className="flex flex-col gap-2 text-sm text-subtle">
                {desktopBenefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2.5">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-link"
                      aria-hidden="true"
                    />
                    <span className="min-w-0">{benefit}</span>
                  </li>
                ))}
              </ul>
              <DesktopDownloadButtons
                release={release}
                size="md"
                stacked
                onDownload={() => {
                  markDesktopPromoSeen();
                  onDownload?.();
                }}
              />
            </div>
          </AlertDialog.Body>
          <AlertDialog.Footer className="mt-2 justify-center">
            <Button slot="close" size="sm" variant="ghost">
              Seguir en la web
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}

export function PreferencesDesktopCard() {
  const release = useDesktopRelease(true);

  return (
    <Card variant="secondary" className="gap-3 p-4">
      <Card.Header>
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-link">
            <Monitor className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <Card.Title>AnimeHub para PC</Card.Title>
            <p className="text-xs text-muted tabular-nums">
              {formatDesktopReleaseSubtitle(release.version)}
            </p>
          </div>
        </div>
      </Card.Header>
      <Card.Content>
        <DesktopDownloadButtons release={release} size="sm" stacked />
      </Card.Content>
    </Card>
  );
}
