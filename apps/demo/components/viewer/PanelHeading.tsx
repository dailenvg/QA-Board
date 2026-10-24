"use client";

import { SquintMascot } from "../brand/mascot/SquintMascot";

interface PanelHeadingProps {
  headingId: string;
  active: number;
  resolved: number;
  celebrating: boolean;
}

/**
 * Mascot plus counts. The mascot celebrates briefly whenever a comment is
 * resolved. It's decorative here (the toast announces the resolve) and keeps
 * its eyes still: a small avatar that tracked every pointer move would pull
 * attention away from the pins while commenting.
 */
export function PanelHeading({ headingId, active, resolved, celebrating }: PanelHeadingProps) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span aria-hidden="true" className="flex shrink-0">
        <SquintMascot mood={celebrating ? "resolved" : "idle"} size={44} followCursor={false} />
      </span>
      <span className="flex min-w-0 flex-col text-left">
        <span id={headingId} className="text-heading font-bold">
          Comments
        </span>
        <span className="text-meta text-muted">
          {active} active · {resolved} resolved
        </span>
      </span>
    </span>
  );
}
