import { createContext, useContext } from "react";
import type { Folder, SquintData } from "@/lib/store/types";

export interface Workspace {
  data: SquintData;
  /** False when the browser blocks storage; changes then last for this visit only. */
  persistent: boolean;
  /** Oldest first, as in the sidebar. Never empty. */
  folders: readonly Folder[];
  /** Opens New project, preselecting `folderId` (else the current folder, else the first). */
  openNewProject: (folderId?: string) => void;
  renameFolder: (folder: Folder) => void;
  deleteFolder: (folder: Folder) => void;
  /** Toasts an error result, or `success` when given. Returns whether it worked. */
  report: (result: { ok: boolean; error?: string }, success?: string) => boolean;
  /** A folder just deleted from its own page, while the app navigates away from it. */
  leavingFolderId: string | null;
}

/** Null until browser storage has been read. */
export const WorkspaceContext = createContext<Workspace | null>(null);

/** The workspace's data and shared actions; null while the store is still loading. */
export function useWorkspace(): Workspace | null {
  return useContext(WorkspaceContext);
}
