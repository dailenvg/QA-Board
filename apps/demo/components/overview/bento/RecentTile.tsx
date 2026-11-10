"use client";

import { AnimatePresence } from "motion/react";
import { useId, type ReactNode } from "react";
import { LIST_ROWS, type RecentProject } from "@/lib/overview/activity";
import { FOLDERS_HREF, projectHref } from "@/lib/routes";
import { AnimatedNumber } from "./AnimatedNumber";
import { MoreLink } from "./MoreLink";
import { NewMark } from "./NewMark";
import { RecentFan } from "./scenes/RecentFan";
import { SceneBox } from "./scenes/SceneBox";
import { useScene } from "./scenes/use-scene";
import { Sparkline } from "./Sparkline";
import { TileEmpty } from "./TileEmpty";
import { TileHeading } from "./TileHeading";
import { TILE_LIST, TILE_LIST_BOX, TILE_SURFACE } from "./tile-styles";
import { TileRow } from "./TileRow";
import { TileTag } from "./TileTag";
import { TimeAgo } from "./TimeAgo";
import { useFitRows } from "./use-fit-rows";

interface RecentTileProps {
  /** The most recently updated projects, newest first. */
  projects: readonly RecentProject[];
  /** Every project the workspace has. */
  total: number;
  /** Projects updated each of the last 7 days, oldest first (`perDay`); empty until the clock is known. */
  week: readonly number[];
  now: number;
  /** A project's thumbnail, by id. */
  thumb: (projectId: string) => ReactNode;
}

/**
 * The newest projects fanning out beside the week's updates as a bar per day,
 * then the most recently updated
 * projects, newest first, each opening its project and marked New when it
 * changed since the last look.
 */
export function RecentTile({ projects, total, week, now, thumb }: RecentTileProps) {
  const headingId = useId();
  const { ref, shown, more } = useFitRows(projects.length, LIST_ROWS.recent.natural, total);
  const thisWeek = week.reduce((sum, count) => sum + count, 0);
  const [sceneRef, scene] = useScene();
  return (
    <section
      aria-labelledby={headingId}
      data-testid="tile-recent"
      onPointerEnter={scene.replay}
      onFocus={scene.replay}
      className={`${TILE_SURFACE} @container`}
    >
      <TileHeading
        id={headingId}
        icon="history"
        title="Recently updated"
        subtitle="Last 7 days"
        tag={
          <TileTag>
            <AnimatedNumber value={thisWeek} />
            {/*
              Narrow tiles (phones, lg's two columns, xl's three) show the number alone, so the
              title isn't cut short; the subtitle already says "Last 7 days". Still read out.
            */}
            <span className="sr-only @[19rem]:not-sr-only"> updated</span>
          </TileTag>
        }
      />
      {projects.length === 0 ? (
        <TileEmpty title="No projects yet">Projects show up here as they change.</TileEmpty>
      ) : (
        <>
          <div className="flex shrink-0 items-end gap-3">
            <SceneBox
              sceneRef={sceneRef}
              scene={scene}
              className="h-12 w-24 shrink-0 bento-fit:h-8 bento-fit:w-18"
            >
              <RecentFan thumbs={projects.slice(0, 3).map((project) => thumb(project.id))} />
            </SceneBox>
            <div className="min-w-0 flex-1">
              <Sparkline
                days={week.length ? week : [0, 0, 0, 0, 0, 0, 0]}
                label={`${thisWeek} ${thisWeek === 1 ? "project" : "projects"} updated in the last 7 days`}
              />
            </div>
          </div>
          <div className={TILE_LIST_BOX}>
            <ol ref={ref} role="list" className={TILE_LIST}>
              {projects.slice(0, shown).map((project) => (
                <TileRow
                  key={project.id}
                  href={projectHref(project.id)}
                  thumb={thumb(project.id)}
                  testId="recent-row"
                  data={{ "data-new": project.isNew ? "true" : undefined }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate text-body font-semibold">{project.name}</span>
                    <AnimatePresence>
                      {project.isNew ? <NewMark key="new" /> : null}
                    </AnimatePresence>
                  </span>
                  <span className="truncate text-meta text-muted">
                    {project.folderName ? `${project.folderName} · ` : ""}
                    <TimeAgo at={project.updatedAt} now={now} />
                  </span>
                </TileRow>
              ))}
            </ol>
            {more ? <MoreLink count={total - shown} href={FOLDERS_HREF} /> : null}
          </div>
        </>
      )}
    </section>
  );
}
