"use client";

import { isArchived } from "@/lib/store/archive";
import { useSquint } from "@/lib/store/use-squint";
import { ViewerBackendContext } from "@/lib/viewer-backend/backend";
import { serverBackend } from "@/lib/viewer-backend/server-backend";
import { WorkspaceError } from "../app-state/WorkspaceError";
import { ArchivedBanner } from "./ArchivedBanner";
import { FolderBackLink } from "./FolderBackLink";
import { ShareControl } from "./ShareControl";
import { ViewerNotFound } from "./ViewerNotFound";
import { ViewerSkeleton } from "./ViewerSkeleton";
import { ViewerView } from "./ViewerView";

/**
 * The owner's viewer: skeleton until the workspace loads, then the project, a
 * not-found state, or the workspace's error state. Render it inside
 * `WorkspaceProvider`; changes go through the server backend. An archived
 * project opens as usual under a bar that offers Unarchive; its review link is
 * closed meanwhile, so Share (and the link's sync) waits until it's back.
 */
export function Viewer({ projectId }: { projectId: string }) {
  const state = useSquint();
  if (state.status === "loading") return <ViewerSkeleton />;
  if (state.status === "error") return <WorkspaceError reason={state.reason} />;
  const project = state.data.projects.find((entry) => entry.id === projectId);
  if (!project) return <ViewerNotFound />;
  const folder = state.data.folders.find((entry) => entry.id === project.folderId);
  const archived = isArchived(project);
  return (
    <ViewerBackendContext value={serverBackend}>
      <ViewerView
        key={project.id}
        data={state.data}
        project={project}
        leading={<FolderBackLink folder={folder} />}
        actions={archived ? null : <ShareControl data={state.data} project={project} />}
        notice={archived ? <ArchivedBanner key="archived-banner" project={project} /> : null}
      />
    </ViewerBackendContext>
  );
}
