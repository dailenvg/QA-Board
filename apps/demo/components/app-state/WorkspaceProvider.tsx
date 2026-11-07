"use client";

import { useCallback, type ReactNode } from "react";
import { BlobSourceContext } from "@/lib/blob-store/blob-source";
import { useWorkspaceData, WorkspaceStartContext } from "@/lib/workspace-client/use-workspace-data";
import type { WorkspaceStart } from "@/lib/workspace/types";
import { useToast } from "../ui/ToastProvider";
import { ImportLocalData } from "./ImportLocalData";

interface WorkspaceProviderProps {
  /** The workspace as the server rendered it. */
  start: WorkspaceStart;
  children: ReactNode;
}

/**
 * Connects the signed-in pages below to the workspace (`useSquint()` reads
 * it, from the server's render on), serves its images, toasts changes the
 * server refused, and offers to import what an earlier build kept in this browser.
 */
export function WorkspaceProvider({ start, children }: WorkspaceProviderProps) {
  const toast = useToast();
  const onNotice = useCallback((message: string) => toast({ tone: "error", message }), [toast]);
  const { blobs, initial } = useWorkspaceData(start, onNotice);
  return (
    <WorkspaceStartContext value={initial}>
      <BlobSourceContext value={blobs}>
        {children}
        <ImportLocalData
          workspaceId={start.data.workspace.id}
          workspaceName={start.data.workspace.name}
        />
      </BlobSourceContext>
    </WorkspaceStartContext>
  );
}
