"use client";

import { useWorkspace } from "../dashboard/workspace-context";
import { OverviewBento } from "./bento/OverviewBento";
import { OverviewEmpty } from "./OverviewEmpty";
import { OverviewHero } from "./OverviewHero";
import { OverviewSkeleton } from "./OverviewSkeleton";

interface OverviewProps {
  /** The signed-in workspace; missing only when it couldn't be read (the shell shows why). */
  workspaceId?: string;
}

/**
 * `/`: what's going on in the workspace, as a bento of tiles (comments
 * waiting, client news, recent projects and more). "Empty" means no projects
 * at all; then the welcome and a short guide take its place, ending in the
 * first step: creating a folder when there are none yet, else adding a
 * project. The folders themselves are on Folders (`/folders`).
 */
export function Overview({ workspaceId }: OverviewProps) {
  const workspace = useWorkspace();
  if (!workspace || workspaceId === undefined) return <OverviewSkeleton />;
  if (workspace.data.projects.length === 0) {
    return (
      <>
        <OverviewHero />
        <OverviewEmpty workspace={workspace} />
      </>
    );
  }
  return <OverviewBento workspace={workspace} workspaceId={workspaceId} />;
}
