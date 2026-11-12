import type { Comment, Folder, ProjectSource, Snapshot } from "../store/types";

/**
 * What the workspace API sends and takes. The shapes are the browser store's
 * (`lib/store/types.ts`), times in epoch ms, blob keys logical (`page:<id>`):
 * a file's storage path never leaves the server.
 */

/** How long a link's clients can comment, as the server keeps and counts it. */
export interface ReviewWindowState {
  /** Hours from the link's creation (24, 72 or 168); null for no limit. */
  reviewWindowHours: number | null;
  /** When the window closes (epoch ms, from the server's creation time); null: never. */
  reviewEndsAt: number | null;
}

/** A project's review link, without its secrets (those come from `share-link` alone). */
export interface WorkspaceShareSummary extends ReviewWindowState {
  id: string;
  createdAt: number;
  cursor: number;
  lastSyncedAt?: number;
}

export interface WorkspaceProject {
  id: string;
  /**
   * Null at the workspace root: only a project whose folder was deleted while
   * it was in the trash, and restored since (the browser store files it).
   */
  folderId: string | null;
  name: string;
  source: ProjectSource;
  createdAt: number;
  updatedAt: number;
  label: string | null;
  archivedAt: number | null;
  /** When an archived project is due to be deleted for good; null unless archived. */
  deleteAfter: number | null;
  share?: WorkspaceShareSummary;
}

/** A project in the trash, until the cron deletes it for good. */
export interface TrashedProject extends WorkspaceProject {
  deletedAt: number;
}

/** The owner's side of a project's review link, as the browser store's `ProjectShare`. */
/** Whether a workspace link asks guests for a password. The password and its hash never leave the server. */
export interface SharePasswordState {
  hasPassword: boolean;
  /** When the current password was set (epoch ms); null without one. */
  passwordSetAt: number | null;
}

/** A link as `GET .../share-link` answers it: with whether it has a password. */
export type OwnerShareLink = ShareLink & SharePasswordState;

export interface ShareLink extends ReviewWindowState {
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

/**
 * Clients' comments on one live project: those pulled into the workspace
 * (`Comment.fromClient`) and those still waiting on its review link.
 */
export interface ClientCommentActivity {
  projectId: string;
  /** Open client comments, pulled or still waiting on the review link. */
  open: number;
  /** When the newest client comment, open or resolved, was posted (epoch ms). */
  latestAt: number;
  /**
   * When each open comment still waiting on the review link was posted,
   * newest first: not pulled yet, so it isn't in `comments`.
   */
  waiting: number[];
  /** The link's pull position `waiting` was read at (0 without a link): a later pull has them. */
  cursor: number;
}

/** Everything a signed-in browser needs to show a workspace. */
export interface WorkspaceData {
  workspace: { id: string; slug: string; name: string };
  folders: Folder[];
  projects: WorkspaceProject[];
  snapshots: Snapshot[];
  comments: Comment[];
  /** Projects with any client comment, for the Overview. */
  clientActivity: ClientCommentActivity[];
  storage: StorageSummary;
  /** The signed-in user's name for new comments; null until they give one. */
  authorName: string | null;
}

/**
 * What a signed-in page starts from: the workspace, and its projects' review
 * links with their secrets (the member's own, as `share-link` answers them).
 */
export interface WorkspaceStart {
  data: WorkspaceData;
  links: ShareLink[];
}
