"use client";

import { useSquint } from "@/lib/store/use-squint";
import { ViewerBackendContext } from "@/lib/viewer-backend/backend";
import { serverBackend } from "@/lib/viewer-backend/server-backend";
import { WorkspaceError } from "../app-state/WorkspaceError";
import { FolderBackLink } from "./FolderBackLink";
import { ShareControl } from "./ShareControl";
import { ViewerNotFound } from "./ViewerNotFound";
import { ViewerSkeleton } from "./ViewerSkeleton";
import { ViewerView } from "./ViewerView";

/**
 * The owner's viewer: skeleton until the workspace loads, then the project, a
 * not-found state, or the workspace's error state. Render it inside
 * `WorkspaceProvider`; changes go through the server backend.
 */
export function Viewer({ projectId }: { projectId: string }) {
  const state = useSquint();
  if (state.status === "loading") return <ViewerSkeleton />;
  if (state.status === "error") return <WorkspaceError reason={state.reason} />;
  const project = state.data.projects.find((entry) => entry.id === projectId);
  if (!project) return <ViewerNotFound />;
  const folder = state.data.folders.find((entry) => entry.id === project.folderId);
  return (
    <ViewerBackendContext value={serverBackend}>
      <ViewerView
        key={project.id}
        data={state.data}
        project={project}
        leading={<FolderBackLink folder={folder} />}
        actions={<ShareControl data={state.data} project={project} />}
      />
    </ViewerBackendContext>
  );
}
