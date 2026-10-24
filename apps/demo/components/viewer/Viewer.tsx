"use client";

import { useEffect } from "react";
import { scheduleBlobSweep } from "@/lib/store/blob-sweep";
import { useSquint } from "@/lib/store/use-squint";
import { DataRecovery } from "../app-state/DataRecovery";
import { ViewerBackendContext } from "@/lib/viewer-backend/backend";
import { FolderBackLink } from "./FolderBackLink";
import { localBackend } from "@/lib/viewer-backend/local-backend";
import { ShareControl } from "./ShareControl";
import { ViewerNotFound } from "./ViewerNotFound";
import { ViewerSkeleton } from "./ViewerSkeleton";
import { ViewerView } from "./ViewerView";

/** The owner's viewer: skeleton until storage is read, then the project or a not-found state. */
export function Viewer({ projectId }: { projectId: string }) {
  const state = useSquint();
  // Tidies images left behind by earlier visits (closed tabs, crashes, cleared metadata).
  useEffect(scheduleBlobSweep, []);
  if (state.status === "loading") return <ViewerSkeleton />;
  if (state.status === "corrupt") return <DataRecovery reason={state.reason} raw={state.raw} />;
  const project = state.data.projects.find((entry) => entry.id === projectId);
  if (!project) return <ViewerNotFound />;
  const folder = state.data.folders.find((entry) => entry.id === project.folderId);
  return (
    <ViewerBackendContext value={localBackend}>
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
