import type { ReactNode } from "react";
import { PinpointWidget, type PinpointWidgetProps } from "./PinpointWidget";

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

/** Wraps the app and mounts the feedback overlay when enabled. */
export function PinpointProvider({
  children,
  enabled = false,
  ...widgetProps
}: PinpointProviderProps) {
  return (
    <>
      {children}
      {enabled ? <PinpointWidget {...widgetProps} /> : null}
    </>
  );
}
