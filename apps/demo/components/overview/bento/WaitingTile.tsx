"use client";

import { useId, type ReactNode } from "react";
import { LIST_ROWS, type WaitingComment } from "@/lib/overview/activity";
import { ageShare } from "@/lib/overview/charts";
import { FOLDERS_HREF, projectHref } from "@/lib/routes";
import { AnimatedNumber } from "./AnimatedNumber";
import { ClientChip } from "./ClientChip";
import { GrowBar } from "./GrowBar";
import { MoreLink } from "./MoreLink";
import { ResolvedPin } from "./ResolvedPin";
import { TileEmpty } from "./TileEmpty";
import { TileHeading } from "./TileHeading";
import { TILE_LIST, TILE_LIST_BOX, TILE_SURFACE } from "./tile-styles";
import { TileRow } from "./TileRow";
import { TileTag } from "./TileTag";
import { TimeAgo } from "./TimeAgo";
import { useFitRows } from "./use-fit-rows";

interface WaitingTileProps {
  open: number;
  resolved: number;
  /** The open comments that have waited longest, oldest first. */
  oldest: readonly WaitingComment[];
  now: number;
  /** A project's thumbnail, by id. */
  thumb: (projectId: string) => ReactNode;
}

/**
 * How many comments are open, and the ones waiting longest, each opening its
 * project, with a bar of how long it has waited against the longest wait.
 */
export function WaitingTile({ open, resolved, oldest, now, thumb }: WaitingTileProps) {
  const headingId = useId();
  const { ref, shown, more } = useFitRows(oldest.length, LIST_ROWS.waiting.natural, open);
  const longestAt = oldest[0]?.createdAt ?? now;
  return (
    <section
      aria-labelledby={headingId}
      data-testid="tile-waiting"
      data-count={open}
      className={TILE_SURFACE}
    >
      <TileHeading
        id={headingId}
        icon="message"
        title="Comments waiting"
        subtitle="Oldest first"
        tag={
          <TileTag tone="comments">
            <AnimatedNumber value={open} testId="tile-count" /> open
          </TileTag>
        }
      />
      {open === 0 ? (
        <TileEmpty title="No comments waiting" art={resolved > 0 ? <ResolvedPin /> : null}>
          {resolved > 0
            ? "Every comment is resolved."
            : "Comments on your projects show up here until they're resolved."}
        </TileEmpty>
      ) : (
        <div className={TILE_LIST_BOX}>
          <ol ref={ref} role="list" className={TILE_LIST}>
            {oldest.slice(0, shown).map((comment) => (
              <TileRow
                key={comment.id}
                href={projectHref(comment.projectId)}
                thumb={thumb(comment.projectId)}
                testId="waiting-row"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate text-body font-semibold">
                    {comment.projectName}
                  </span>
                  {comment.fromClient ? <ClientChip /> : null}
                </span>
                <span className="truncate text-meta text-ink-2">{comment.body}</span>
                <span className="flex items-center gap-2">
                  <GrowBar
                    share={now ? ageShare(comment.createdAt, longestAt, now) : 0}
                    fill="bg-comments"
                    className="flex-1"
                  />
                  <span className="shrink-0 text-meta text-muted">
                    <TimeAgo at={comment.createdAt} now={now} />
                  </span>
                </span>
              </TileRow>
            ))}
          </ol>
          {more ? <MoreLink count={open - shown} href={FOLDERS_HREF} /> : null}
        </div>
      )}
    </section>
  );
}
