"use client";

import { useSquint } from "@/lib/store/use-squint";
import { DataRecovery } from "../app-state/DataRecovery";
import { ViewerNotFound } from "./ViewerNotFound";
import { ViewerSkeleton } from "./ViewerSkeleton";
import { ViewerView } from "./ViewerView";

/** Viewer entry: skeleton until storage is read, then the project or a not-found state. */
export function Viewer({ projectId }: { projectId: string }) {
  const state = useSquint();
  if (state.status === "loading") return <ViewerSkeleton />;
  if (state.status === "corrupt") return <DataRecovery reason={state.reason} raw={state.raw} />;
  const project = state.data.projects.find((entry) => entry.id === projectId);
  if (!project) return <ViewerNotFound />;
  return <ViewerView key={project.id} data={state.data} project={project} />;
}
