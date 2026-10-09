"use client";

import { useSyncExternalStore } from "react";
import { deviceProfileScript } from "@/lib/device-script";

const subscribe = () => () => {};

/**
 * Sets html[data-device] from the server HTML, before the first paint.
 *
 * The script exists only in server-rendered HTML (and during its hydration):
 * a document that React renders on the client — Next's error and nested 404
 * pages — never creates it, since React can't execute scripts it creates
 * ("Encountered a script tag…"). Those pages get the attribute from the
 * DownloadProvider layout effect, which also runs before their first paint.
 */
export function DeviceProfileScript() {
  const fromServerHtml = useSyncExternalStore(
    subscribe,
    () => false,
    () => true,
  );
  if (!fromServerHtml) return null;
  return <script dangerouslySetInnerHTML={{ __html: deviceProfileScript }} />;
}
