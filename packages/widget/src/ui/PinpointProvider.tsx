import type { ReactNode } from "react";
import { LocationReporter } from "./LocationReporter";
import type { PinpointWidgetProps } from "./PinpointWidget";
import { WidgetLoader } from "./WidgetLoader";

export interface PinpointProviderProps extends PinpointWidgetProps {
  children?: ReactNode;
  /**
   * Whether the widget may render at all. Defaults to false so it never ships
   * to production by accident; `@pinpoint/widget/next` defaults it to
   * `NEXT_PUBLIC_VERCEL_ENV === "preview"`. Even when enabled, nothing appears
   * without a `?review=<token>` link.
   */
  enabled?: boolean;
  /**
   * Opt-in, separate from `enabled`: when this site is shown inside a review
   * tool's frame (such as Squint), tell it which page is open, so its comments
   * follow navigation. Pass `{ targetOrigin }` (recommended) to post only to the
   * review tool; `true` posts the full address, query included, to any framing
   * page. Off by default; does nothing when the page isn't framed.
   */
  reportLocation?: boolean | { targetOrigin: string };
}

/**
 * Wraps the app. A tiny shell: the overlay itself is code-split and only
 * downloaded when `enabled` is true and a valid review token is present.
 */
export function PinpointProvider({
  children,
  enabled = false,
  reportLocation = false,
  ...widgetProps
}: PinpointProviderProps) {
  return (
    <>
      {children}
      {enabled ? <WidgetLoader {...widgetProps} /> : null}
      {reportLocation === true ? <LocationReporter /> : null}
      {typeof reportLocation === "object" ? (
        <LocationReporter targetOrigin={reportLocation.targetOrigin} />
      ) : null}
    </>
  );
}
