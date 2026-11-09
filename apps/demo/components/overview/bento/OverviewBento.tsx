"use client";

import { useMemo } from "react";
import { folderSwatches } from "@/lib/brand-palette";
import { childFolders } from "@/lib/store/folders";
import {
  busiestFolder,
  commentTotals,
  newFromClients,
  oldestOpen,
  recentProjects,
} from "@/lib/overview/activity";
import { useVisit } from "@/lib/overview/use-visit";
import { useNow } from "@/lib/use-now";
import { useClientActivity } from "@/lib/workspace-client/use-client-activity";
import type { Workspace } from "../../dashboard/workspace-context";
import { useStoryPlayback } from "../welcome/use-story-playback";
import { BentoTile } from "./BentoTile";
import { BusiestTile } from "./BusiestTile";
import { ClientsTile } from "./ClientsTile";
import { HeroTile } from "./HeroTile";
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
 */
export function OverviewBento({ workspace, workspaceId }: OverviewBentoProps) {
  const { data, folders } = workspace;
  const activity = useClientActivity();
  const visit = useVisit(workspaceId);
  const since = visit?.since ?? null;
  const now = useNow();
  const playback = useStoryPlayback();

  const totals = useMemo(() => commentTotals(data), [data]);
  const oldest = useMemo(() => oldestOpen(data), [data]);
  const recent = useMemo(() => recentProjects(data, since), [data, since]);
  const news = useMemo(
    () => (since === null ? null : newFromClients(data, activity, since)),
    [data, activity, since],
  );
  const busiest = useMemo(() => busiestFolder(data), [data]);
  const swatch = useMemo(
    () => (busiest ? (folderSwatches(folders).get(busiest.id) ?? null) : null),
    [busiest, folders],
  );
  // Top-level folders, as Folders counts them: every project sits in one of them.
  const topLevel = childFolders(folders, null).length;
  const summary = `${plural(data.projects.length, "project")} in ${plural(topLevel, "folder")}.`;

  return (
    <div
      data-testid="overview-bento"
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      <BentoTile order={0} className="md:col-span-2">
        <HeroTile summary={summary} />
      </BentoTile>
      <BentoTile order={1}>
        <StatusTile {...totals} />
      </BentoTile>
      <BentoTile order={2} className="md:row-span-2">
        <WaitingTile {...totals} oldest={oldest} now={now} />
      </BentoTile>
      <BentoTile order={3} className="xl:col-span-2">
        <ClientsTile news={news} visit={visit} playback={playback} now={now} />
      </BentoTile>
      <BentoTile order={4}>
        <RecentTile projects={recent} now={now} />
      </BentoTile>
      <BentoTile order={5}>
        <BusiestTile folder={busiest} swatch={swatch} />
      </BentoTile>
    </div>
  );
}
