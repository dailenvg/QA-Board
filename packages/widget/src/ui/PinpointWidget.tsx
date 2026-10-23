import { useMemo } from "react";
import { createHttpClient } from "../core/api-client";
import type { PinpointClient } from "../core/client";
import { Overlay } from "./Overlay";
import { ShadowPortal } from "./ShadowPortal";

export interface PinpointWidgetProps {
  /** Custom transport, e.g. `createMemoryClient()`. Takes precedence over `endpoint`. */
  client?: PinpointClient;
  /** URL of the pinpoint route handler. Defaults to `/api/pinpoint`. */
  endpoint?: string;
  /** Branch name shown in the toolbar. */
  branch?: string | null;
  /** Page path pins are keyed by. Defaults to `location.pathname`, tracked across navigations. */
  path?: string;
}

interface LoadedWidgetProps extends PinpointWidgetProps {
  /** A captured, non-expired review token; `WidgetLoader` only renders this with one. */
  token: string;
}

/**
 * The full overlay (shadow root, styles, toolbar, pins, popovers). Loaded on
 * demand by `WidgetLoader`, so pages without a review token never download it.
 */
export function PinpointWidget({
  token,
  client,
  endpoint,
  branch = null,
  path,
}: LoadedWidgetProps) {
  const resolvedClient = useMemo(
    () => client ?? createHttpClient(endpoint === undefined ? {} : { endpoint }),
    [client, endpoint],
  );

  return (
    <ShadowPortal>
      {(host) => (
        <Overlay host={host} client={resolvedClient} token={token} branch={branch} path={path} />
      )}
    </ShadowPortal>
  );
}
