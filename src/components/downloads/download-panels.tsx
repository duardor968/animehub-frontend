"use client";

import {
  Alert,
  Button,
  Checkbox,
  CheckboxGroup,
  Description,
  InputGroup,
  Label,
  Radio,
  RadioGroup,
  Skeleton,
  Spinner,
  TextArea,
  TextField,
} from "@heroui/react";
import { Check, ClipboardCopy, RefreshCw, Send } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { EmptyState } from "../empty-state";
import { copyLinks } from "./download-client";
import {
  copyOnlyProviders,
  providerLabels,
  type AudioPreference,
  type DownloadDestination,
  type DownloadPreferences,
  type DownloadProviderId,
} from "./download-types";

export interface MyJdDevice {
  id: string;
  name: string;
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
  // On a computer the device is picked per download; from Preferences the
  // list only shows what the account has. Phones remember the one picked.
  const pickable = hasTarget || portable;
  return (
    <div className="flex flex-col gap-6">
      {deviceError && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{deviceError}</Alert.Title>
          </Alert.Content>
        </Alert>
      )}
      {connected ? (
        <div className="flex flex-col gap-4">
          {devicesLoading ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              <Skeleton className="h-10 rounded-3xl" />
              <Skeleton className="h-10 rounded-3xl" />
            </div>
          ) : devices.length === 0 ? (
            <EmptyState
              title="No hay dispositivos conectados"
              description="Abre JDownloader en el equipo de destino con esta cuenta de MyJDownloader."
            />
          ) : pickable ? (
            <ul className="flex flex-col gap-2" aria-label="Dispositivos">
              {devices.map((device) => (
                <li key={device.id}>
                  <Button
                    fullWidth
                    variant="secondary"
                    className="justify-between"
                    onPress={() => onSelectDevice(device.id)}
                    isDisabled={deliveryPending}
                  >
                    <span className="min-w-0 truncate">{device.name}</span>
                    <Send aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <ul
              className="flex flex-col gap-2 text-sm"
              aria-label="Dispositivos"
            >
              {devices.map((device) => (
                <li key={device.id} className="truncate">
                  {device.name}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onPress={onRefresh}
              isPending={devicesLoading}
            >
              <RefreshCw aria-hidden="true" />
              Actualizar
            </Button>
            <Button variant="ghost" onPress={onReset}>
              Usar otra cuenta
            </Button>
          </div>
        </div>
      ) : (
        <MyJdLoginForm connecting={connecting} onConnect={onConnect} />
      )}
      {hasTarget && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onPress={onCopyInstead}
            isDisabled={deliveryPending}
          >
            <ClipboardCopy aria-hidden="true" />
            Copiar enlaces
          </Button>
          {!portable && (
            <Button
              variant="secondary"
              onPress={onUseClickNLoad}
              isDisabled={deliveryPending}
            >
              Usar Click&apos;n&apos;Load
            </Button>
          )}
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
      <TextField
        type="email"
        name="email"
        value={email}
        onChange={setEmail}
        variant="secondary"
        isRequired
        isDisabled={connecting}
      >
        <Label>Correo</Label>
        <InputGroup>
          <InputGroup.Input autoComplete="username" spellCheck={false} />
        </InputGroup>
      </TextField>
      <TextField
        type="password"
        name="password"
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
        <Description>No se guarda en AnimeHub.</Description>
      </TextField>
      <Button type="submit" fullWidth isPending={connecting}>
        {({ isPending }) => (
          <>
            {isPending && (
              <Spinner color="current" size="sm" aria-hidden="true" />
            )}
            {isPending ? "Conectando…" : "Conectar"}
          </>
        )}
      </Button>
    </form>
  );
}

/** Manual-copy fallback for browsers that block the clipboard. */
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
      {copied === "blocked" && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>El navegador bloqueó el portapapeles</Alert.Title>
            <Alert.Description>
              Los enlaces están seleccionados: cópialos con Ctrl+C (⌘C) o mantén
              pulsado el texto.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <TextField isReadOnly value={urls.join("\n")} variant="secondary">
        <Label>Enlaces</Label>
        <TextArea
          ref={areaRef}
          rows={Math.min(10, Math.max(4, urls.length))}
          onFocus={(event) => event.currentTarget.select()}
          className="font-mono"
        />
      </TextField>
      <Button fullWidth onPress={() => void copy()}>
        {copied === "done" ? (
          <>
            <Check aria-hidden="true" />
            Copiados
          </>
        ) : (
          <>
            <ClipboardCopy aria-hidden="true" />
            Copiar enlaces
          </>
        )}
      </Button>
      <p className="sr-only" role="status">
        {copied === "done" ? "Enlaces copiados al portapapeles." : ""}
      </p>
    </div>
  );
}

// Both JDownloader options send to a JDownloader: where tells them apart.
const destinationOptions: Array<{
  id: DownloadDestination;
  label: string;
  description?: string;
}> = [
  {
    id: "CNL",
    label: "Click'n'Load",
    description: "Al JDownloader de este equipo.",
  },
  {
    id: "MYJD",
    label: "MyJDownloader",
    description: "A cualquier JDownloader de tu cuenta.",
  },
  { id: "COPY", label: "Copiar enlaces" },
];

export function PreferencesPanel({
  preferences,
  savePreferences,
  portable,
  effectiveDestination,
  selectedDeviceName,
  myJdConnected,
  openDeviceSettings,
}: {
  preferences: DownloadPreferences;
  savePreferences: (next: DownloadPreferences) => void;
  portable: boolean;
  effectiveDestination: DownloadDestination;
  selectedDeviceName: string | null;
  /** A MyJDownloader session exists in this browser. */
  myJdConnected: boolean;
  openDeviceSettings: () => void;
}) {
  const sendableProviders = preferences.providers.filter(
    (provider) => !copyOnlyProviders.has(provider),
  );
  return (
    <div className="flex flex-col gap-6">
      <RadioGroup
        variant="secondary"
        value={preferences.audio}
        onChange={(audio) =>
          savePreferences({ ...preferences, audio: audio as AudioPreference })
        }
      >
        <Label>Audio preferido</Label>
        <OptionRadio value="SUB" label="Subtitulado (SUB)" />
        <OptionRadio value="DUB" label="Doblado (DUB)" />
      </RadioGroup>
      <CheckboxGroup
        variant="secondary"
        value={preferences.providers}
        onChange={(providers) =>
          savePreferences({
            ...preferences,
            providers: providers as DownloadProviderId[],
          })
        }
      >
        <Label>Proveedores</Label>
        <div className="grid grid-cols-2 gap-x-4">
          {(
            Object.entries(providerLabels) as Array<
              [DownloadProviderId, string]
            >
          ).map(([provider, label]) => (
            <Checkbox
              key={provider}
              value={provider}
              // At least one provider a JDownloader takes stays marked.
              isDisabled={
                sendableProviders.length === 1 &&
                sendableProviders[0] === provider
              }
              className="checkbox-visible"
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                {label}
              </Checkbox.Content>
              {copyOnlyProviders.has(provider) && (
                <Description>Solo al copiar enlaces.</Description>
              )}
            </Checkbox>
          ))}
        </div>
      </CheckboxGroup>
      <div className="flex flex-col gap-4">
        <RadioGroup
          variant="secondary"
          value={effectiveDestination}
          onChange={(destination) =>
            savePreferences({
              ...preferences,
              destination: destination as DownloadDestination,
            })
          }
        >
          <Label>Destino</Label>
          {destinationOptions
            .filter((option) => !(portable && option.id === "CNL"))
            .map((option) => (
              <OptionRadio key={option.id} value={option.id} {...option} />
            ))}
        </RadioGroup>
        {effectiveDestination === "MYJD" && (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">
                {portable ? "Dispositivo" : "Cuenta de MyJDownloader"}
              </p>
              <p className="truncate text-xs text-muted">
                {portable
                  ? (selectedDeviceName ?? "Sin elegir")
                  : myJdConnected
                    ? "Conectada"
                    : "Sin conectar"}
              </p>
            </div>
            <Button size="sm" variant="secondary" onPress={openDeviceSettings}>
              {portable
                ? selectedDeviceName
                  ? "Cambiar"
                  : "Elegir"
                : myJdConnected
                  ? "Ver dispositivos"
                  : "Conectar"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function OptionRadio({
  value,
  label,
  description,
}: {
  value: string;
  label: string;
  description?: string;
}) {
  return (
    <Radio value={value}>
      <Radio.Content>
        <Radio.Control>
          <Radio.Indicator />
        </Radio.Control>
        {label}
      </Radio.Content>
      {description && <Description>{description}</Description>}
    </Radio>
  );
}
