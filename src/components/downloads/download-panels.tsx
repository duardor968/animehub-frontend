"use client";

import {
  Button,
  Checkbox,
  InputGroup,
  Label,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { Check, ClipboardCopy, RefreshCw, Send } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { copyLinks, providerLabels } from "./download-client";
import type {
  DownloadDestination,
  DownloadPreferences,
  DownloadProviderId,
} from "./download-types";

export interface MyJdDevice {
  id: string;
  name: string;
}

const panelButton =
  "min-h-11 rounded-xl px-4 font-semibold shadow-none outline-none focus-visible:ring-2 focus-visible:ring-focus";

/** "Vas a enviar: One Piece · Ep. 5" — the drawer says what it acts on. */
export function DrawerSummary({ summary }: { summary: string | null }) {
  if (!summary) return null;
  return (
    <p className="rounded-xl bg-surface px-4 py-3 text-sm text-subtle">
      <span className="text-muted">Vas a enviar: </span>
      <strong className="font-semibold text-foreground">{summary}</strong>
    </p>
  );
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm leading-5 text-danger-soft-foreground"
      role="alert"
    >
      {message}
    </div>
  );
}

export function MyJdPanel({
  portable,
  connected,
  connecting,
  devices,
  devicesLoading,
  deviceError,
  hasTarget,
  deliveryPending,
  onConnect,
  onRefresh,
  onReset,
  onSelectDevice,
  onCopyInstead,
  onUseClickNLoad,
}: {
  portable: boolean;
  connected: boolean;
  connecting: boolean;
  devices: MyJdDevice[];
  devicesLoading: boolean;
  deviceError: string | null;
  /** A download is waiting for this panel (vs. configuring from settings). */
  hasTarget: boolean;
  deliveryPending: boolean;
  onConnect: (email: string, password: string) => void;
  onRefresh: () => void;
  onReset: () => void;
  onSelectDevice: (deviceId: string) => void;
  onCopyInstead: () => void;
  onUseClickNLoad: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ErrorNote message={deviceError} />
      {connected ? (
        <>
          {devicesLoading ? (
            <div
              className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted"
              role="status"
            >
              <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
              Buscando dispositivos…
            </div>
          ) : devices.length > 0 ? (
            <>
              <p className="text-sm leading-5 text-muted">
                {hasTarget
                  ? "Elige el JDownloader al que enviar los enlaces."
                  : portable
                    ? "El dispositivo elegido se recordará durante esta sesión."
                    : "Al descargar podrás elegir el dispositivo de destino."}
              </p>
              <ul className="flex flex-col gap-2">
                {devices.map((device) => (
                  <li key={device.id}>
                    <Button
                      variant="secondary"
                      className="min-h-12 w-full justify-between gap-3 rounded-xl bg-surface px-4 text-foreground shadow-none outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus"
                      onPress={() => onSelectDevice(device.id)}
                      isDisabled={deliveryPending || (!hasTarget && !portable)}
                    >
                      <span className="min-w-0 truncate">{device.name}</span>
                      <Send size={16} aria-hidden="true" className="shrink-0" />
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="rounded-xl bg-surface p-4">
              <strong className="text-sm text-foreground">
                No hay dispositivos conectados
              </strong>
              <p className="mt-1 text-xs leading-5 text-muted">
                Abre JDownloader en el equipo de destino, comprueba que use esta
                cuenta de MyJDownloader y vuelve a buscar.
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              className={`${panelButton} bg-default text-foreground hover:bg-default-hover`}
              onPress={onRefresh}
              isPending={devicesLoading}
            >
              <RefreshCw size={15} aria-hidden="true" /> Actualizar
            </Button>
            <Button
              variant="ghost"
              className={`${panelButton} text-muted hover:text-foreground`}
              onPress={onReset}
            >
              Usar otra cuenta
            </Button>
          </div>
        </>
      ) : (
        <MyJdLoginForm connecting={connecting} onConnect={onConnect} />
      )}
      {hasTarget && (
        <div className="mt-2 border-t border-white/8 pt-4">
          <p className="text-sm font-semibold text-foreground">
            ¿Prefieres otra opción?
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Copia los enlaces y pégalos en tu gestor de descargas
            {portable ? "." : ", o envíalos al JDownloader de este equipo."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              className={`${panelButton} bg-default text-foreground hover:bg-default-hover`}
              onPress={onCopyInstead}
              isDisabled={deliveryPending}
            >
              <ClipboardCopy size={15} aria-hidden="true" /> Copiar enlaces
            </Button>
            {!portable && (
              <Button
                variant="secondary"
                className={`${panelButton} bg-default text-foreground hover:bg-default-hover`}
                onPress={onUseClickNLoad}
                isDisabled={deliveryPending}
              >
                Usar Click&apos;n&apos;Load
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MyJdLoginForm({
  connecting,
  onConnect,
}: {
  connecting: boolean;
  onConnect: (email: string, password: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (connecting) return;
    onConnect(email, password);
    // The password is used once to derive the session and never kept.
    setPassword("");
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <p className="text-sm leading-5 text-muted">
        Conecta tu cuenta de MyJDownloader para enviar los enlaces a cualquier
        JDownloader vinculado. La contraseña no se guarda.
      </p>
      <TextField
        type="email"
        value={email}
        onChange={setEmail}
        variant="secondary"
        isRequired
        isDisabled={connecting}
      >
        <Label>Correo</Label>
        <InputGroup>
          <InputGroup.Input autoComplete="username" />
        </InputGroup>
      </TextField>
      <TextField
        type="password"
        value={password}
        onChange={setPassword}
        variant="secondary"
        isRequired
        isDisabled={connecting}
      >
        <Label>Contraseña</Label>
        <InputGroup>
          <InputGroup.Input autoComplete="current-password" />
        </InputGroup>
      </TextField>
      <Button
        type="submit"
        isPending={connecting}
        className={`${panelButton} bg-accent text-accent-foreground hover:bg-accent-hover`}
      >
        {connecting ? "Conectando…" : "Conectar"}
      </Button>
    </form>
  );
}

/** Manual-copy fallback: the links in a selectable textarea, for browsers
 *  that block the clipboard. */
export function LinksPanel({
  urls,
  onCopied,
}: {
  urls: string[];
  onCopied: () => void;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState<"idle" | "done" | "blocked">("idle");

  async function copy() {
    const ok = await copyLinks(urls);
    if (!ok) {
      areaRef.current?.focus();
      areaRef.current?.select();
    }
    setCopied(ok ? "done" : "blocked");
    if (ok) onCopied();
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-5 text-muted">
        Un enlace por línea. Pégalos en JDownloader (LinkGrabber) o en tu gestor
        de descargas.
      </p>
      <label className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-subtle">Enlaces</span>
        <textarea
          ref={areaRef}
          readOnly
          value={urls.join("\n")}
          rows={Math.min(10, Math.max(4, urls.length))}
          onFocus={(event) => event.currentTarget.select()}
          className="min-h-28 w-full resize-y rounded-xl border border-white/10 bg-field p-3 font-mono text-xs leading-5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      </label>
      <Button
        className={`${panelButton} bg-accent text-accent-foreground hover:bg-accent-hover`}
        onPress={() => void copy()}
      >
        {copied === "done" ? (
          <>
            <Check size={15} aria-hidden="true" /> Copiados
          </>
        ) : (
          <>
            <ClipboardCopy size={15} aria-hidden="true" /> Copiar enlaces
          </>
        )}
      </Button>
      <p className="text-xs leading-5 text-muted" role="status">
        {copied === "blocked"
          ? "El navegador bloqueó el portapapeles. Los enlaces están seleccionados: cópialos con Ctrl+C (⌘C) o mantén pulsado el texto."
          : copied === "done"
            ? "Enlaces copiados al portapapeles."
            : ""}
      </p>
    </div>
  );
}

const destinationHelp: Record<DownloadDestination, string> = {
  CNL: "Envía los enlaces al JDownloader de este equipo. Necesita JDownloader abierto con Click'n'Load activo (puerto 9666).",
  MYJD: "Envía los enlaces a un JDownloader de tu cuenta de MyJDownloader, esté donde esté.",
  COPY: "Copia los enlaces al portapapeles para pegarlos donde quieras. Funciona en cualquier dispositivo.",
};

const toggleClass =
  "min-h-11 w-full rounded-lg px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-focus";

export function PreferencesPanel({
  preferences,
  savePreferences,
  toggleProvider,
  portable,
  effectiveDestination,
  selectedDeviceName,
  openDeviceSettings,
}: {
  preferences: DownloadPreferences;
  savePreferences: (next: DownloadPreferences) => void;
  toggleProvider: (provider: DownloadProviderId) => void;
  portable: boolean;
  effectiveDestination: DownloadDestination;
  selectedDeviceName: string | null;
  openDeviceSettings: () => void;
}) {
  const destinations: DownloadDestination[] = portable
    ? ["MYJD", "COPY"]
    : ["CNL", "MYJD", "COPY"];
  const destinationLabels: Record<DownloadDestination, string> = {
    CNL: "Click'n'Load",
    MYJD: "MyJDownloader",
    COPY: "Copiar enlaces",
  };
  return (
    <div className="flex flex-col gap-6">
      <fieldset className="border-b border-white/8 pb-5">
        <legend className="mb-3 text-sm font-semibold text-foreground">
          Audio preferido
        </legend>
        <ToggleButtonGroup
          aria-label="Audio preferido"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={new Set([preferences.audio])}
          onSelectionChange={(keys) => {
            const audio = Array.from(keys)[0] as "SUB" | "DUB" | undefined;
            if (audio) savePreferences({ ...preferences, audio });
          }}
          className="grid w-full grid-cols-2 gap-2"
        >
          <ToggleButton id="SUB" className={toggleClass}>
            Subtitulado (SUB)
          </ToggleButton>
          <ToggleButton id="DUB" className={toggleClass}>
            Doblado (DUB)
          </ToggleButton>
        </ToggleButtonGroup>
        <p className="mt-2 text-xs leading-5 text-muted">
          Si un episodio no está disponible así, se usará el otro audio.
        </p>
      </fieldset>
      <fieldset className="border-b border-white/8 pb-5">
        <legend className="mb-1 text-sm font-semibold text-foreground">
          Proveedores
        </legend>
        <p className="mb-2 text-xs leading-5 text-muted">
          Se envían todos los espejos disponibles de los proveedores marcados.
        </p>
        <div className="grid grid-cols-2 gap-x-3">
          {(Object.keys(providerLabels) as DownloadProviderId[]).map(
            (provider) => (
              <Checkbox
                key={provider}
                isSelected={preferences.providers.includes(provider)}
                onChange={() => toggleProvider(provider)}
                className="checkbox-visible min-h-11 justify-center text-sm text-subtle"
              >
                <Checkbox.Content className="gap-2.5">
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  {providerLabels[provider]}
                </Checkbox.Content>
              </Checkbox>
            ),
          )}
        </div>
      </fieldset>
      <fieldset className="pb-1">
        <legend className="mb-3 text-sm font-semibold text-foreground">
          Destino
        </legend>
        <ToggleButtonGroup
          aria-label="Destino de los enlaces"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={new Set([effectiveDestination])}
          onSelectionChange={(keys) => {
            const destination = Array.from(keys)[0] as
              DownloadDestination | undefined;
            if (destination) savePreferences({ ...preferences, destination });
          }}
          className={`grid w-full gap-2 ${portable ? "grid-cols-2" : "grid-cols-3 max-[26rem]:grid-cols-1"}`}
        >
          {destinations.map((destination) => (
            <ToggleButton
              key={destination}
              id={destination}
              className={toggleClass}
            >
              {destinationLabels[destination]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <p className="mt-2 text-xs leading-5 text-muted">
          {destinationHelp[effectiveDestination]}
        </p>
        {portable && effectiveDestination === "MYJD" && (
          <div className="mt-3 flex min-h-14 items-center gap-3 rounded-xl bg-surface px-4 py-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-tertiary text-link">
              <Send size={16} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-sm text-foreground">
                Dispositivo
              </strong>
              <span className="block truncate text-xs text-muted">
                {selectedDeviceName ?? "Sin dispositivo elegido"}
              </span>
            </span>
            <Button
              variant="ghost"
              className="min-h-11 shrink-0 rounded-lg px-3 text-xs font-semibold text-link outline-none focus-visible:ring-2 focus-visible:ring-focus"
              onPress={openDeviceSettings}
            >
              {selectedDeviceName ? "Cambiar" : "Configurar"}
            </Button>
          </div>
        )}
      </fieldset>
    </div>
  );
}
