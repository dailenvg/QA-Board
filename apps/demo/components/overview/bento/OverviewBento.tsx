"use client";

import { useCallback, useMemo } from "react";
import { perDay, startOfDay } from "@/lib/overview/charts";
import { childFolders } from "@/lib/store/folders";
import { previewKeyOf } from "@/lib/store/selectors";
import {
  commentTotals,
  leavingSoon,
  newFromClients,
  oldestOpen,
  recentProjects,
} from "@/lib/overview/activity";
import { useVisit } from "@/lib/overview/use-visit";
import { useNow } from "@/lib/use-now";
import { useClientActivity } from "@/lib/workspace-client/use-client-activity";
import type { Workspace } from "../../dashboard/workspace-context";
import { BentoTile } from "./BentoTile";
import { ClientsTile } from "./ClientsTile";
import { BENTO_GRID } from "./bento-grid";
import { HeroTile } from "./HeroTile";
import { LeavingTile } from "./LeavingTile";
import { ProjectThumb } from "./ProjectThumb";
import { RecentTile } from "./RecentTile";
import { StatusTile } from "./StatusTile";
import { WaitingTile } from "./WaitingTile";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

interface OverviewBentoProps {
  workspace: Workspace;
  /** Whose last visit to remember (in this browser). */
  workspaceId: string;
}

/**
 * The Overview of a workspace with projects: an asymmetric bento of what's
 * going on. Phones stack the tiles; from md two columns, the hero across both
 * and Comments waiting two rows tall; from xl three, the hero and the client
 * news two columns wide. Three start at xl, not lg: beside the sidebar, lg's
 * page is about 700px wide, which would leave each tile about 220px (the ring
 * and its counts wrap, rows truncate). Tiles keep reading order across all three.
 * Where a wide window is also tall enough (`bento-fit`), the bento takes the
 * rest of the screen and no more (`BENTO_GRID`): lists show the rows that fit.
 */
export function OverviewBento({ workspace, workspaceId }: OverviewBentoProps) {
  const { data, allData, folders } = workspace;
  const activity = useClientActivity();
  const visit = useVisit(workspaceId);
  const since = visit?.since ?? null;
  const now = useNow();

  const totals = useMemo(() => commentTotals(data), [data]);
  const oldest = useMemo(() => oldestOpen(data), [data]);
  const recent = useMemo(() => recentProjects(data, since), [data, since]);
  const news = useMemo(
    () => (since === null ? null : newFromClients(data, activity, since)),
    [data, activity, since],
  );
  const week = useMemo(
    () =>
      now
        ? perDay(
            data.projects.map((project) => project.updatedAt),
            startOfDay(now),
          )
        : [],
    [data.projects, now],
  );
  // From the whole workspace: Deleting soon shows archived projects' thumbnails too.
  const byId = useMemo(
    () => new Map(allData.projects.map((project) => [project.id, project])),
    [allData.projects],
  );
  const thumb = useCallback(
    (projectId: string) => {
      const project = byId.get(projectId);
      return project ? (
        <ProjectThumb source={project.source} previewKey={previewKeyOf(allData, project)} />
      ) : null;
    },
    [byId, allData],
  );
  const leaving = useMemo(() => leavingSoon(allData), [allData]);
  const archivedCount = allData.projects.length - data.projects.length;
  // Top-level folders, as Folders counts them: every project sits in one of them.
  const topLevel = childFolders(folders, null).length;
  const summary = `${plural(data.projects.length, "project")} in ${plural(topLevel, "folder")}.`;

  return (
    <div data-testid="overview-bento" className={BENTO_GRID}>
      <BentoTile order={0} className="md:col-span-2">
        <HeroTile summary={summary} {...totals} />
      </BentoTile>
      <BentoTile order={1}>
        <StatusTile {...totals} />
      </BentoTile>
      <BentoTile order={2} className="md:row-span-2">
        <WaitingTile {...totals} oldest={oldest} now={now} thumb={thumb} />
      </BentoTile>
      <BentoTile order={3} className="xl:col-span-2">
        <ClientsTile news={news} now={now} thumb={thumb} />
      </BentoTile>
      <BentoTile order={4}>
        <RecentTile
          projects={recent}
          total={data.projects.length}
          week={week}
          now={now}
          thumb={thumb}
        />
      </BentoTile>
      <BentoTile order={5}>
        <LeavingTile projects={leaving} total={archivedCount} now={now} thumb={thumb} />
      </BentoTile>
    </div>
  );
}
