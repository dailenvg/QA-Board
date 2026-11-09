"use client";

import Link from "next/link";
import { useId } from "react";
import type { WaitingComment } from "@/lib/overview/activity";
import { projectHref } from "@/lib/routes";
import { ClientChip } from "./ClientChip";
import { ResolvedPin } from "./ResolvedPin";
import { TileEmpty } from "./TileEmpty";
import { TileHeading } from "./TileHeading";
import { TILE_LIST, TILE_ROW, TILE_SURFACE } from "./tile-styles";
import { TimeAgo } from "./TimeAgo";

interface WaitingTileProps {
  open: number;
  resolved: number;
  /** The open comments that have waited longest, oldest first. */
  oldest: readonly WaitingComment[];
  now: number;
}

/** How many comments are open, and the ones waiting longest, each opening its project. */
export function WaitingTile({ open, resolved, oldest, now }: WaitingTileProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      data-testid="tile-waiting"
      data-count={open}
      className={TILE_SURFACE}
    >
      <TileHeading id={headingId} icon="message" tone="comments">
        Comments waiting
      </TileHeading>
      {open === 0 ? (
        <TileEmpty title="No comments waiting" art={resolved > 0 ? <ResolvedPin /> : null}>
          {resolved > 0
            ? "Every comment is resolved."
            : "Comments on your projects show up here until they're resolved."}
        </TileEmpty>
      ) : (
        <>
          <p className="flex items-end gap-3">
            <span data-testid="tile-count" className="text-display font-bold tabular-nums">
              {open}
            </span>
            <span className="pb-1 text-body text-muted">
              open {open === 1 ? "comment" : "comments"}
            </span>
          </p>
          <div className="flex flex-col gap-2">
            <h3 className="label-caps text-muted">Waiting longest</h3>
            <ol role="list" className={TILE_LIST}>
              {oldest.map((comment) => (
                <li key={comment.id}>
                  <Link
                    href={projectHref(comment.projectId)}
                    data-testid="waiting-row"
                    className={TILE_ROW}
                  >
                    <span className="flex min-w-0 items-center gap-2 text-meta">
                      <span className="min-w-0 truncate font-semibold">{comment.projectName}</span>
                      {comment.fromClient ? <ClientChip /> : null}
                    </span>
                    <span className="line-clamp-2 text-body break-words text-ink-2">
                      {comment.body}
                    </span>
                    <span className="truncate text-meta text-muted">
                      {comment.author} · <TimeAgo at={comment.createdAt} now={now} />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </section>
  );
}
