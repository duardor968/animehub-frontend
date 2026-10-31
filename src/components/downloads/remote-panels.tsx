"use client";

import {
  Alert,
  AlertDialog,
  Button,
  Description,
  Drawer,
  Input,
  Label,
  ListBox,
  Radio,
  RadioGroup,
  Select,
  Skeleton,
  TextField,
  Typography,
} from "@heroui/react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useId, useState } from "react";
import { remoteStatus, requestEpisodes, requestLabel } from "./remote-client";
import type { RemoteDownloads } from "./use-remote-downloads";
import { describeRequest } from "./download-copy";

const wideScreen = () => window.matchMedia("(min-width: 64rem)").matches;

function RemoteError({ message }: { message: string | null }) {
  return message ? (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{message}</Alert.Title>
      </Alert.Content>
    </Alert>
  ) : null;
}
export function RemotePreferences({
  remote,
  desktopSelected,
}: {
  remote: RemoteDownloads;
  desktopSelected: boolean;
}) {
  const [pairing, setPairing] = useState(false);
  const [code, setCode] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const headingId = useId();
  const device = remote.devices.find((d) => d.id === removing);
  return (
    <div className="flex flex-col gap-6">
      <RemoteError
        message={remote.errorScope === "settings" ? remote.error : null}
      />
      {desktopSelected && remote.loaded && !remote.devices.length && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Vincula un PC o elige otro destino.</Alert.Title>
          </Alert.Content>
        </Alert>
      )}
      {desktopSelected && remote.devices.length > 1 && (
        <Select
          value={
            remote.preferred === "ask" ||
            remote.devices.some((d) => d.id === remote.preferred)
              ? remote.preferred
              : null
          }
          placeholder="Elegir PC…"
          onChange={(v) => remote.choosePreferred(String(v))}
          isDisabled={remote.busy}
        >
          <Label>PC de destino</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {remote.devices.map((d) => (
                <ListBox.Item key={d.id} id={d.id} textValue={d.name}>
                  {d.name}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
              <ListBox.Item id="ask" textValue="Preguntar cada vez">
                Preguntar cada vez
                <ListBox.ItemIndicator />
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
      )}
      <section className="flex flex-col gap-4" aria-labelledby={headingId}>
        <div className="flex items-center justify-between gap-3">
          {/* A group of the drawer, titled like the others (Destino…). */}
          <Label elementType="h3" id={headingId}>
            Dispositivos vinculados
          </Label>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => {
              remote.clearError();
              setPairing(true);
            }}
            isDisabled={remote.busy}
          >
            Vincular un PC
          </Button>
        </div>
        {!remote.loaded ? (
          <Skeleton className="h-16" aria-label="Cargando dispositivos" />
        ) : remote.devices.length ? (
          <ul className="flex flex-col gap-4">
            {remote.devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{d.name}</p>
                  <p className="text-xs text-muted">
                    {d.online
                      ? "Conectado"
                      : desktopSelected
                        ? "Sin conexión · Los envíos quedarán pendientes"
                        : "Sin conexión"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Desvincular ${d.name}`}
                  onPress={() => setRemoving(d.id)}
                  isDisabled={remote.busy}
                >
                  Desvincular
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Ningún PC vinculado.</p>
        )}
        {remote.errorScope === "settings" && remote.error && (
          <Button
            size="sm"
            variant="ghost"
            onPress={remote.refresh}
            isPending={remote.busy}
          >
            <RefreshCw aria-hidden="true" />
            Actualizar dispositivos
          </Button>
        )}
      </section>
      {!!remote.requests.length && (
        <div className="flex items-center justify-between gap-3">
          <Label elementType="h3">Solicitudes recientes</Label>
          <Button
            size="sm"
            variant="secondary"
            aria-label="Ver las solicitudes recientes"
            onPress={remote.list}
          >
            Ver
          </Button>
        </div>
      )}
      <Drawer.Backdrop
        isOpen={pairing}
        onOpenChange={(open) => {
          if (!remote.busy) setPairing(open);
        }}
      >
        <Drawer.Content placement="right">
          <Drawer.Dialog aria-label="Vincular un PC">
            <Drawer.CloseTrigger
              aria-label="Cerrar vinculación"
              isDisabled={remote.busy}
            />
            <Drawer.Header>
              <Typography type="h3">Vincular un PC</Typography>
            </Drawer.Header>
            <Drawer.Body>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  remote.link(code, () => {
                    setPairing(false);
                    setCode("");
                  });
                }}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => setPairing(false)}
                  isDisabled={remote.busy}
                >
                  <ArrowLeft aria-hidden="true" />
                  Preferencias
                </Button>
                <RemoteError
                  message={
                    remote.errorScope === "settings" ? remote.error : null
                  }
                />
                <p className="text-sm">
                  Introduce el código de Dispositivos vinculados en AnimeHub
                  para PC.
                </p>
                <TextField
                  name="pair-code"
                  value={code}
                  onChange={setCode}
                  isRequired
                  isDisabled={remote.busy}
                  // On the field, not the input: React Aria focuses it after
                  // the press that opened the drawer and before the dialog
                  // takes focus. Phones would open the keyboard over it.
                  autoFocus={wideScreen()}
                >
                  <Label>Código de vinculación</Label>
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    spellCheck={false}
                    placeholder="123456…"
                  />
                </TextField>
                <Button type="submit" isPending={remote.busy}>
                  Vincular
                </Button>
              </form>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
      <AlertDialog.Backdrop
        isOpen={Boolean(device)}
        onOpenChange={(open) => {
          if (!open && !remote.busy) setRemoving(null);
        }}
      >
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>
                Desvincular {device?.name}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                Se cancelarán sus solicitudes pendientes. Las descargas que ya
                recibió seguirán en el PC.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                variant="tertiary"
                onPress={() => setRemoving(null)}
                isDisabled={remote.busy}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                isPending={remote.busy}
                onPress={() =>
                  device && remote.unlink(device.id, () => setRemoving(null))
                }
              >
                Desvincular
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}
export function RemoteDownloadDrawer({
  remote,
  openPreferences,
}: {
  remote: RemoteDownloads;
  openPreferences: () => void;
}) {
  const chosen = remote.chosenDeviceId;
  const [cancelId, setCancelId] = useState<string | null>(null);
  const request = remote.requests.find((r) => r.id === remote.selectedRequest);
  const target = remote.devices.find((d) => d.id === request?.deviceId);
  const name = target?.name ?? "PC desvinculado";
  const listing = remote.panel === "requests";
  const heading =
    remote.panel === "choose"
      ? "Elegir PC"
      : listing
        ? "Solicitudes recientes"
        : "Solicitud de descarga";
  // The list itself, or under one request the others.
  const listed = remote.requests
    .filter((r) => listing || r.id !== request?.id)
    .slice(0, 20);
  return (
    <>
      <Drawer.Backdrop
        isOpen={Boolean(remote.panel)}
        onOpenChange={(open) => {
          if (!open && !remote.busy) remote.setPanel(null);
        }}
      >
        <Drawer.Content placement="right">
          <Drawer.Dialog aria-label={heading}>
            <Drawer.CloseTrigger aria-label="Cerrar" isDisabled={remote.busy} />
            <Drawer.Header>
              <Typography type="h3">{heading}</Typography>
            </Drawer.Header>
            <Drawer.Body>
              <div className="flex flex-col gap-6">
                {remote.panel !== "choose" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="self-start"
                    onPress={() => {
                      remote.setPanel(null);
                      openPreferences();
                    }}
                    isDisabled={remote.busy}
                  >
                    <ArrowLeft aria-hidden="true" />
                    Preferencias
                  </Button>
                )}
                <RemoteError
                  message={
                    remote.errorScope === "request" ? remote.error : null
                  }
                />
                {remote.errorScope === "request" &&
                  remote.error &&
                  remote.profileRetry && (
                    <Button
                      variant="secondary"
                      onPress={remote.retryProfile}
                      isPending={remote.busy}
                    >
                      Volver a intentar
                    </Button>
                  )}
                {remote.panel === "choose" ? (
                  <>
                    <p className="text-sm">
                      {remote.download ? describeRequest(remote.download) : ""}
                    </p>
                    <RadioGroup
                      aria-label="PC para esta descarga"
                      value={chosen}
                      onChange={remote.setChosenDeviceId}
                      isDisabled={remote.busy}
                    >
                      {remote.devices.map((d) => (
                        <Radio key={d.id} value={d.id}>
                          <Radio.Content>
                            <Radio.Control>
                              <Radio.Indicator />
                            </Radio.Control>
                            {d.name}
                          </Radio.Content>
                          <Description>
                            {d.online
                              ? "Conectado"
                              : "Sin conexión · El envío quedará pendiente"}
                          </Description>
                        </Radio>
                      ))}
                    </RadioGroup>
                    <Button
                      isDisabled={!chosen}
                      isPending={remote.busy}
                      onPress={() => remote.choose(chosen)}
                    >
                      Descargar
                    </Button>
                  </>
                ) : listing ? null : request ? (
                  <>
                    <dl className="flex flex-col gap-4">
                      <div>
                        <Label elementType="dt">Anime</Label>
                        <dd className="text-sm text-foreground">
                          {request.animeTitle ?? "Título no disponible"}
                        </dd>
                      </div>
                      <div>
                        <Label elementType="dt">Episodios</Label>
                        <dd className="text-sm text-foreground">
                          {requestEpisodes(request)}
                        </dd>
                      </div>
                      <div>
                        <Label elementType="dt">Estado</Label>
                        <dd role="status" className="text-sm text-foreground">
                          {remoteStatus(
                            request,
                            name,
                            target ? !target.online : false,
                          )}
                        </dd>
                      </div>
                    </dl>
                    {request.status === "pending" && (
                      <Button
                        variant="secondary"
                        isDisabled={remote.busy}
                        onPress={() => setCancelId(request.id)}
                      >
                        Cancelar solicitud
                      </Button>
                    )}
                  </>
                ) : (
                  <p role="status">
                    {remote.busy
                      ? "Enviando solicitud…"
                      : "La solicitud no se ha confirmado."}
                  </p>
                )}
                {remote.canRetry && !remote.busy && (
                  <Button onPress={remote.retry}>Reintentar envío</Button>
                )}
                {listed.length > 0 && (
                  <section
                    className="flex flex-col gap-4"
                    aria-label="Solicitudes recientes"
                  >
                    {!listing && (
                      <Label elementType="h3">Solicitudes recientes</Label>
                    )}
                    <ul className="flex flex-col gap-4">
                      {listed.map((r) => {
                        const device = remote.devices.find(
                          (d) => d.id === r.deviceId,
                        );
                        const targetName = device?.name ?? "PC desvinculado";
                        return (
                          <li
                            key={r.id}
                            className="flex flex-wrap items-center gap-3"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-sm text-foreground">
                                {requestLabel(r)}
                              </p>
                              <p className="text-xs text-muted">
                                {remoteStatus(
                                  r,
                                  targetName,
                                  device ? !device.online : false,
                                )}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Ver la solicitud de ${requestLabel(r)}`}
                              onPress={() => remote.view(r.id)}
                            >
                              Ver solicitud
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
              </div>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
      <AlertDialog.Backdrop
        isOpen={Boolean(cancelId)}
        onOpenChange={(open) => {
          if (!open && !remote.busy) setCancelId(null);
        }}
      >
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>Cancelar solicitud</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>Se cancelará si el PC todavía no la ha recibido.</p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" onPress={() => setCancelId(null)}>
                Volver
              </Button>
              <Button
                variant="danger"
                isPending={remote.busy}
                onPress={() => {
                  if (cancelId) remote.cancel(cancelId);
                  setCancelId(null);
                }}
              >
                Cancelar solicitud
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>
  );
}
