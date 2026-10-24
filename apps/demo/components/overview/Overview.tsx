"use client";

import { useWorkspace } from "../dashboard/workspace-context";
import { FolderGrid } from "./FolderGrid";
import { OverviewEmpty } from "./OverviewEmpty";
import { OverviewHero } from "./OverviewHero";
import { OverviewSkeleton } from "./OverviewSkeleton";

/**
 * `/`: the hero, then every folder as a glass folder. A default folder always
 * exists, so "empty" means no projects at all; then a short guide replaces the grid.
 */
export function Overview() {
  const workspace = useWorkspace();
  if (!workspace) return <OverviewSkeleton />;
  const empty = workspace.data.projects.length === 0;
  const openNewProject = () => workspace.openNewProject();
  return (
    <>
      <OverviewHero empty={empty} onNewProject={openNewProject} />
      {empty ? <OverviewEmpty onAction={openNewProject} /> : <FolderGrid workspace={workspace} />}
    </>
  );
}
