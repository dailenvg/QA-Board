import type { Comment, Folder, ProjectSource, Snapshot } from "../store/types";

/**
 * What the workspace API sends and takes. The shapes are the browser store's
 * (`lib/store/types.ts`), times in epoch ms, blob keys logical (`page:<id>`):
 * a file's storage path never leaves the server.
 */

/** A project's review link, without its secrets (those come from `share-link` alone). */
export interface WorkspaceShareSummary {
  id: string;
  createdAt: number;
  cursor: number;
  lastSyncedAt?: number;
}

export interface WorkspaceProject {
  id: string;
  folderId: string;
  name: string;
  source: ProjectSource;
  createdAt: number;
  updatedAt: number;
  label: string | null;
  archivedAt: number | null;
  share?: WorkspaceShareSummary;
}

/** A project in the trash, until the cron deletes it for good. */
export interface TrashedProject extends WorkspaceProject {
  deletedAt: number;
}

/** The owner's side of a project's review link, as the browser store's `ProjectShare`. */
export interface ShareLink {
  id: string;
  token: string;
  ownerKey: string;
  createdAt: number;
  cursor: number;
  lastSyncedAt?: number;
}

export interface StorageSummary {
  bytes: number;
  blobCount: number;
  quotaBytes: number;
}

/** Everything a signed-in browser needs to show a workspace. */
export interface WorkspaceData {
  workspace: { id: string; slug: string; name: string };
  folders: Folder[];
  projects: WorkspaceProject[];
  snapshots: Snapshot[];
  comments: Comment[];
  storage: StorageSummary;
  /** The signed-in user's name for new comments; null until they give one. */
  authorName: string | null;
}
