"use client";

import { useId, type ReactNode } from "react";
import { LIST_ROWS, type LeavingProject } from "@/lib/overview/activity";
import { FOLDERS_HREF, projectHref } from "@/lib/routes";
import { shortDate } from "../../ui/deletion-when";
import { AnimatedNumber } from "./AnimatedNumber";
import { GrowBar } from "./GrowBar";
import { MoreLink } from "./MoreLink";
import { TileEmpty } from "./TileEmpty";
import { TileHeading } from "./TileHeading";
import { TILE_LIST, TILE_LIST_BOX, TILE_SURFACE } from "./tile-styles";
import { TileRow } from "./TileRow";
import { TileTag } from "./TileTag";
import { useFitRows } from "./use-fit-rows";

const DAY_MS = 24 * 60 * 60 * 1000;

/** English like the rest of the copy: "today", "tomorrow", "in 4 days". */
const relativeDays = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** Midnight that starts `at`'s day in this browser's time zone. */
function startOfDay(at: number): number {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/** How soon, in calendar days here; past the date, until the daily cron gets to it. */
function howSoon(deleteAfter: number, now: number): string {
  if (deleteAfter <= now) return "Due for deletion";
  const days = Math.round((startOfDay(deleteAfter) - startOfDay(now)) / DAY_MS);
  return relativeDays.format(days, "day");
}

/** How much of its time in the archive has gone, 0 to 1. */
function timeGone({ archivedAt, deleteAfter }: LeavingProject, now: number): number {
  const span = deleteAfter - archivedAt;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (now - archivedAt) / span));
}

interface LeavingTileProps {
  /** Archived projects, the one deleted for good soonest first (`leavingSoon`). */
  projects: readonly LeavingProject[];
  /** Every archived project the workspace has. */
  total: number;
  now: number;
  /** A project's thumbnail, by id. */
  thumb: (projectId: string) => ReactNode;
}

/**
 * The archived projects about to be deleted for good, soonest first, each
 * opening its project (where its banner offers Unarchive), with a bar of how
 * much of its time in the archive has gone. Dates wait for the browser's clock.
 */
export function LeavingTile({ projects, total, now, thumb }: LeavingTileProps) {
  const headingId = useId();
  const { ref, shown, more } = useFitRows(projects.length, LIST_ROWS.leaving.natural, total);
  return (
    <section
      aria-labelledby={headingId}
      data-testid="tile-leaving"
      data-count={total}
      className={`${TILE_SURFACE} @container`}
    >
      <TileHeading
        id={headingId}
        title="Deleting soon"
        tag={
          <TileTag>
            <AnimatedNumber value={total} />
            {/* Narrow tiles show the number alone, so the title isn't cut short. Still read out. */}
            <span className="sr-only @[19rem]:not-sr-only"> archived</span>
          </TileTag>
        }
      />
      {projects.length === 0 ? (
        <TileEmpty title="Nothing to delete" scene="archive">
          {"Archived projects show up here before they're deleted for good."}
        </TileEmpty>
      ) : (
        <div className={TILE_LIST_BOX}>
          <ol ref={ref} role="list" className={TILE_LIST}>
            {projects.slice(0, shown).map((project) => (
              <TileRow
                key={project.id}
                href={projectHref(project.id)}
                thumb={thumb(project.id)}
                testId="leaving-row"
              >
                <span className="min-w-0 truncate text-body font-semibold">{project.name}</span>
                <span className="truncate text-meta text-ink-2">
                  {now ? (
                    <>
                      Deletes for good on{" "}
                      <time dateTime={new Date(project.deleteAfter).toISOString()}>
                        {shortDate(project.deleteAfter, now)}
                      </time>
                    </>
                  ) : null}
                </span>
                <span className="flex items-center gap-2">
                  <GrowBar
                    share={now ? timeGone(project, now) : 0}
                    fill="bg-danger"
                    className="flex-1"
                  />
                  <span className="shrink-0 text-meta text-muted">
                    {now ? howSoon(project.deleteAfter, now) : ""}
                  </span>
                </span>
              </TileRow>
            ))}
          </ol>
          {more ? <MoreLink count={total - shown} href={FOLDERS_HREF} /> : null}
        </div>
      )}
    </section>
  );
}
