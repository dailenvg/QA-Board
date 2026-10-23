import { useMemo } from "react";
import { createHttpClient } from "../core/api-client";
import type { PinpointClient } from "../core/client";
import { Overlay } from "./Overlay";
import { ShadowPortal } from "./ShadowPortal";
import { useReviewToken } from "./hooks/use-review-token";

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

/** Token gate: renders nothing, and makes no requests, until a review token exists. */
export function PinpointWidget({ client, endpoint, branch = null, path }: PinpointWidgetProps) {
  const token = useReviewToken();
  const resolvedClient = useMemo(
    () => client ?? createHttpClient(endpoint === undefined ? {} : { endpoint }),
    [client, endpoint],
  );

  if (!token) return null;
  return (
    <ShadowPortal>
      {(host) => (
        <Overlay host={host} client={resolvedClient} token={token} branch={branch} path={path} />
      )}
    </ShadowPortal>
  );
}
