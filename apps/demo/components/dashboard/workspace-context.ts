import { createContext, useContext } from "react";
import type { Folder, SquintData } from "@/lib/store/types";
import type { MenuItem } from "../ui/Menu";

export interface Workspace {
  data: SquintData;
  /** False when the browser blocks storage; changes then last for this visit only. */
  persistent: boolean;
  /** Oldest first, as in the sidebar. Empty until the person creates their first folder. */
  folders: readonly Folder[];
  /**
   * Opens New project, preselecting `folderId` (else the current folder, else the first; with
   * no folders yet, a new one to name).
   */
  openNewProject: (folderId?: string) => void;
  /** Opens New folder, at the top level (null) or inside `parentId`. */
  newFolder: (parentId: string | null) => void;
  renameFolder: (folder: Folder) => void;
  moveFolder: (folder: Folder) => void;
  deleteFolder: (folder: Folder) => void;
  /** False when deleting it (with its subfolders) would leave no folder. */
  canDeleteFolder: (folder: Folder) => boolean;
  /**
   * The folder actions every folder menu offers (sidebar tree, folder page, folder cards):
   * new folder inside, rename, move and delete.
   */
  folderActions: (folder: Folder) => MenuItem[];
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
