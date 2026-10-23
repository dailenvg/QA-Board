import type { ReactNode } from "react";
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
}

/**
 * Wraps the app. A tiny shell: the overlay itself is code-split and only
 * downloaded when `enabled` is true and a valid review token is present.
 */
export function PinpointProvider({
  children,
  enabled = false,
  ...widgetProps
}: PinpointProviderProps) {
  return (
    <>
      {children}
      {enabled ? <WidgetLoader {...widgetProps} /> : null}
    </>
  );
}
