import { useEffect } from "react";
import { reportLocation } from "../core/location";

export interface LocationReporterProps {
  /** Who may read the address: set it to the review tool's origin (see `reportLocation`). */
  targetOrigin?: string;
}

/**
 * Renders nothing. While mounted inside a frame, tells the parent page which
 * page this is, on load and on every client-side navigation, so a review tool
 * that frames the site (such as Squint) can follow along.
 */
export function LocationReporter({ targetOrigin }: LocationReporterProps) {
  useEffect(
    () => reportLocation(targetOrigin === undefined ? {} : { targetOrigin }),
    [targetOrigin],
  );
  return null;
}
