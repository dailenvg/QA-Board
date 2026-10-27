"use client";

import { useWorkspace } from "../dashboard/workspace-context";
import { OverviewEmpty } from "./OverviewEmpty";
import { OverviewFolders } from "./OverviewFolders";
import { OverviewHero } from "./OverviewHero";
import { OverviewSkeleton } from "./OverviewSkeleton";

/**
 * `/`: the hero, then every top-level folder as a glass folder (its count
 * includes its subfolders' projects), in the order chosen above them. "Empty"
 * means no projects at all; then a short guide replaces the grid, ending in
 * the first step: creating a folder when there are none yet, else adding a
 * project.
 */
export function Overview() {
  const workspace = useWorkspace();
  if (!workspace) return <OverviewSkeleton />;
  const empty = workspace.data.projects.length === 0;
  return (
    <>
      <OverviewHero empty={empty} />
      {empty ? (
        <OverviewEmpty
          firstStep={workspace.folders.length ? "project" : "folder"}
          onAction={() =>
            workspace.folders.length ? workspace.openNewProject() : workspace.newFolder(null)
          }
        />
      ) : (
        <OverviewFolders workspace={workspace} />
      )}
    </>
  );
}
