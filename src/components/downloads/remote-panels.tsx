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
import { useState } from "react";
import { formatEpisodeNumber, formatNumber } from "@/lib/format";
import {
  attentionReason,
  remoteOnline,
  type RemoteRequest,
} from "./remote-client";
import type { RemoteDownloads } from "./use-remote-downloads";
import { describeRequest } from "./download-copy";

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
      {desktopSelected && remote.devices.length === 1 && (
        <div>
          <Label>PC de destino</Label>
          <p className="text-sm">{remote.devices[0].name}</p>
          <p className="text-sm text-muted">
            {remoteOnline(remote.devices[0])
              ? "Conectado"
              : "Sin conexión · Los envíos quedarán pendientes"}
          </p>
        </div>
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
      <section className="flex flex-col gap-4" aria-label="Equipos vinculados">
        <div className="flex items-center justify-between gap-3">
          <Typography type="h3" className="remote-devices-heading">
            Equipos vinculados
          </Typography>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => {
              remote.clearError();
              setPairing(true);
            }}
            isDisabled={remote.busy}
          >
            {remote.devices.length ? "Vincular otro" : "Vincular un PC"}
          </Button>
        </div>
        {!remote.loaded ? (
          <Skeleton className="h-16" aria-label="Cargando equipos" />
        ) : remote.devices.length ? (
          <ul className="flex flex-col gap-4">
            {remote.devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{d.name}</p>
                  <p className="text-xs text-muted">
                    {remoteOnline(d) ? "Conectado" : "Sin conexión"}
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
          <p className="text-sm text-muted">No hay equipos vinculados.</p>
        )}
        {remote.errorScope === "settings" && remote.error && (
          <Button
            size="sm"
            variant="ghost"
            onPress={remote.refresh}
            isPending={remote.busy}
          >
            <RefreshCw aria-hidden="true" />
            Actualizar equipos
          </Button>
        )}
        {!!remote.requests.length && (
          <Button
            variant="ghost"
            onPress={() => remote.view(remote.requests[0].id)}
          >
            Solicitudes recientes
          </Button>
        )}
      </section>
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
                  Desktop.
                </p>
                <TextField
                  name="pair-code"
                  value={code}
                  onChange={setCode}
                  isRequired
                  isDisabled={remote.busy}
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
function remoteStatus(request: RemoteRequest, name: string, offline = false) {
  if (request.status === "accepted") return `Recibida por ${name} · En cola`;
  if (request.status === "cancelled") return "Solicitud cancelada";
  if (request.status === "requires_attention")
    return attentionReason(request.reason);
  return `Pendiente de entrega · ${name}${offline ? " sin conexión" : ""}`;
}
function episodeLabel(request: RemoteRequest) {
  return request.episodeNumbers.length > 6
    ? `${formatNumber(request.episodeNumbers.length)} episodios`
    : `Ep. ${request.episodeNumbers.map(formatEpisodeNumber).join(", ")}`;
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
  const otherRequests = remote.requests
    .filter((r) => r.id !== request?.id)
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
          <Drawer.Dialog
            aria-label={
              remote.panel === "choose" ? "Elegir PC" : "Solicitud de descarga"
            }
          >
            <Drawer.CloseTrigger aria-label="Cerrar" isDisabled={remote.busy} />
            <Drawer.Header>
              <Typography type="h3">
                {remote.panel === "choose"
                  ? "Elegir PC"
                  : "Solicitud de descarga"}
              </Typography>
            </Drawer.Header>
            <Drawer.Body>
              <div className="flex flex-col gap-6">
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
                {remote.errorScope === "request" &&
                  remote.error &&
                  !remote.profileRetry &&
                  !remote.busy && (
                    <Button
                      variant="secondary"
                      onPress={() => {
                        remote.setPanel(null);
                        openPreferences();
                      }}
                    >
                      Preferencias de descarga
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
                            {remoteOnline(d)
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
                ) : request ? (
                  <>
                    <p className="text-sm">
                      {request.animeTitle ?? "Título no disponible"} ·{" "}
                      {episodeLabel(request)}
                    </p>
                    <p role="status">
                      {remoteStatus(
                        request,
                        name,
                        target ? !remoteOnline(target) : false,
                      )}
                    </p>
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
                {otherRequests.length > 0 && (
                  <section
                    className="flex flex-col gap-4"
                    aria-label="Solicitudes recientes"
                  >
                    <Typography type="h3">Solicitudes recientes</Typography>
                    <ul className="flex flex-col gap-4">
                      {otherRequests.map((r) => {
                        const targetName =
                          remote.devices.find((d) => d.id === r.deviceId)
                            ?.name ?? "PC desvinculado";
                        return (
                          <li
                            key={r.id}
                            className="flex flex-wrap items-center gap-3"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-sm">
                                {r.animeTitle ?? "Título no disponible"} ·{" "}
                                {episodeLabel(r)} · {targetName}
                              </p>
                              <p className="text-xs text-muted">
                                {remoteStatus(r, targetName)}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Ver solicitud para ${targetName}`}
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
