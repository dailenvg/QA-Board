"use client";

import { useId } from "react";
import { resolvedPercent, type CommentTotals } from "@/lib/overview/activity";
import { STATUS_DOT } from "../../ui/StatusChip";
import { AnimatedNumber } from "./AnimatedNumber";
import { StatusRing } from "./StatusRing";
import { TileEmpty } from "./TileEmpty";
import { TileHeading } from "./TileHeading";
import { TILE_SURFACE } from "./tile-styles";
import { TileTag } from "./TileTag";

/** Open against resolved across the workspace: the ring and both counts. */
export function StatusTile({ open, resolved }: CommentTotals) {
  const headingId = useId();
  const total = open + resolved;
  return (
    <section
      aria-labelledby={headingId}
      data-testid="tile-status"
      data-open={open}
      data-resolved={resolved}
      className={`${TILE_SURFACE} @container`}
    >
      <TileHeading
        id={headingId}
        icon="check"
        title="Open vs resolved"
        subtitle="All comments"
        tag={
          total > 0 ? (
            <TileTag>
              <AnimatedNumber value={total} />
              {/*
                Shows "4 total"; read as "4 comments in total". Narrow tiles (phones, lg's two
                columns, xl's three) show the number alone, as Recently updated does, so the
                title isn't cut short; the subtitle says what it counts.
              */}
              <span className="sr-only">{total === 1 ? " comment in" : " comments in"}</span>
              <span className="sr-only @[19rem]:not-sr-only"> total</span>
            </TileTag>
          ) : null
        }
      />
      {total === 0 ? (
        <TileEmpty title="No comments yet">
          Once people comment, this shows how much is resolved.
        </TileEmpty>
      ) : (
        <div className="flex min-h-0 flex-1 flex-wrap items-center gap-x-4 gap-y-4">
          <StatusRing open={open} resolved={resolved} />
          <dl className="grid grid-cols-[auto_auto] items-center gap-x-4 gap-y-2 text-body">
            <dt className="flex items-center gap-2 text-muted">
              <span aria-hidden="true" className={`size-2.5 rounded-pill ${STATUS_DOT.comments}`} />
              Open
            </dt>
            <dd className="text-right text-heading font-bold">
              <AnimatedNumber value={open} testId="status-open" />
            </dd>
            <dt className="flex items-center gap-2 text-muted">
              <span aria-hidden="true" className={`size-2.5 rounded-pill ${STATUS_DOT.resolved}`} />
              Resolved
            </dt>
            <dd className="text-right text-heading font-bold">
              <AnimatedNumber value={resolved} testId="status-resolved" />
            </dd>
          </dl>
          <p className="sr-only">{resolvedPercent({ open, resolved })}% resolved</p>
        </div>
      )}
    </section>
  );
}
