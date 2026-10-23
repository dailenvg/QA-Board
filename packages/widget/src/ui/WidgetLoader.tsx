import { lazy, Suspense } from "react";
import { useReviewToken } from "./hooks/use-review-token";
import type { PinpointWidgetProps } from "./PinpointWidget";

/**
 * Split point: everything visual lives behind this dynamic import, so the
 * code shipped to every visitor is just this gate and the token helpers.
 */
const PinpointWidget = lazy(() =>
  import("./PinpointWidget").then((module) => ({ default: module.PinpointWidget })),
);

/** Token gate: renders nothing, fetches nothing, and loads no UI code until a token exists. */
export function WidgetLoader(props: PinpointWidgetProps) {
  const token = useReviewToken();
  if (!token) return null;
  return (
    <Suspense fallback={null}>
      <PinpointWidget {...props} token={token} />
    </Suspense>
  );
}
