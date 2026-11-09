"use client";

import { useId } from "react";
import { resolvedPercent, type CommentTotals } from "@/lib/overview/activity";
import { STATUS_DOT } from "../../ui/StatusChip";
import { StatusRing } from "./StatusRing";
import { TileEmpty } from "./TileEmpty";
import { TileHeading } from "./TileHeading";
import { TILE_SURFACE } from "./tile-styles";

/** Open against resolved across the workspace: the ring, and both counts in words. */
export function StatusTile({ open, resolved }: CommentTotals) {
  const headingId = useId();
  const total = open + resolved;
  return (
    <section
      aria-labelledby={headingId}
      data-testid="tile-status"
      data-open={open}
      data-resolved={resolved}
      className={TILE_SURFACE}
    >
      <TileHeading id={headingId} icon="check" tone="resolved">
        Open vs resolved
      </TileHeading>
      {total === 0 ? (
        <TileEmpty title="No comments yet">
          Once people comment, this shows how much is resolved.
        </TileEmpty>
      ) : (
        <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-4">
          <StatusRing open={open} resolved={resolved} />
          <dl className="grid grid-cols-[auto_auto] items-center gap-x-3 gap-y-2 text-body">
            <dt className="flex items-center gap-2 text-muted">
              <span aria-hidden="true" className={`size-2.5 rounded-pill ${STATUS_DOT.comments}`} />
              Open
            </dt>
            <dd data-testid="status-open" className="text-right font-bold tabular-nums">
              {open}
            </dd>
            <dt className="flex items-center gap-2 text-muted">
              <span aria-hidden="true" className={`size-2.5 rounded-pill ${STATUS_DOT.resolved}`} />
              Resolved
            </dt>
            <dd data-testid="status-resolved" className="text-right font-bold tabular-nums">
              {resolved}
            </dd>
          </dl>
          <p className="sr-only">{resolvedPercent({ open, resolved })}% resolved</p>
        </div>
      )}
    </section>
  );
}
