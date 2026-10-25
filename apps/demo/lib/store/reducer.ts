import { prunableSnapshotIds } from "./snapshots";
import type {
  Comment,
  CommentCrop,
  CommentStatus,
  Folder,
  Project,
  ProjectShare,
  ProjectSource,
  Snapshot,
  SquintData,
} from "./types";

export type Action =
  | { type: "folder/create"; folder: Folder }
  | { type: "folder/rename"; id: string; name: string }
  | { type: "folder/delete"; id: string; at: number }
  | { type: "project/create"; project: Project }
  | { type: "project/rename"; id: string; name: string; at: number }
  | { type: "project/move"; id: string; folderId: string; at: number }
  | { type: "project/replace-source"; id: string; source: ProjectSource; at: number }
  | { type: "project/delete"; id: string; at: number }
  /** Undo for a delete: puts the project, its comments and snapshots back exactly as they were. */
  | { type: "project/restore"; project: Project; comments: Comment[]; snapshots: Snapshot[] }
  | { type: "comment/add"; comment: Comment }
  /** Undo for a delete: puts the comment back with its original id, number and timestamps. */
  | { type: "comment/restore"; comment: Comment }
  | { type: "comment/edit"; id: string; body: string; at: number }
  | { type: "comment/set-status"; id: string; status: CommentStatus; at: number }
  | { type: "comment/delete"; id: string }
  /** Attaches the picture saved after posting. Not an edit: timestamps stay as they are. */
  | { type: "comment/set-crop"; id: string; crop: CommentCrop }
  | { type: "snapshot/add"; snapshot: Snapshot }
  /**
   * Drops snapshots that are neither a project's latest nor under any comment,
   * except those whose image a pending Undo holds (`held` blob keys).
   */
  | { type: "snapshot/prune"; held: readonly string[] }
  | { type: "author/set"; name: string }
  | { type: "project/share"; id: string; share: ProjectShare }
  | { type: "project/unshare"; id: string }
  /** The project's delete is final (its Undo is gone): revoke its share now. */
  | { type: "revocation/due"; projectId: string; at: number }
  /** The server revoked it (or no longer had it). */
  | { type: "revocation/done"; shareId: string }
  /** A push or pull succeeded. */
  | { type: "share/synced"; id: string; at: number }
  /**
   * Client additions pulled from the share. Idempotent: ids already here are
   * skipped, so a repeated pull changes nothing. The owner's copy wins.
   */
  | {
      type: "share/merge";
      id: string;
      comments: Comment[];
      snapshots: Snapshot[];
      cursor: number;
      at: number;
    };

function updateShare(
  data: SquintData,
  id: string,
  change: (share: ProjectShare) => ProjectShare,
): SquintData {
  return {
    ...data,
    projects: data.projects.map((project) =>
      project.id === id && project.share ? { ...project, share: change(project.share) } : project,
    ),
  };
}

function mergeShared(data: SquintData, action: Extract<Action, { type: "share/merge" }>) {
  const project = data.projects.find((entry) => entry.id === action.id);
  if (!project?.share) return data;
  const commentIds = new Set(data.comments.map((comment) => comment.id));
  const snapshotIds = new Set(data.snapshots.map((snapshot) => snapshot.id));
  const comments = action.comments.filter((comment) => !commentIds.has(comment.id));
  const snapshots = action.snapshots.filter((snapshot) => !snapshotIds.has(snapshot.id));
  const merged = updateShare(data, action.id, (share) => ({
    ...share,
    cursor: Math.max(share.cursor, action.cursor),
    lastSyncedAt: action.at,
  }));
  if (comments.length === 0 && snapshots.length === 0) return merged;
  return {
    ...merged,
    comments: [...merged.comments, ...comments],
    snapshots: [...merged.snapshots, ...snapshots],
    projects: touchProject(merged.projects, action.id, action.at),
  };
}

/** Undo window fallback, in case the page closes before the Undo toast does. */
export const REVOKE_GRACE_MS = 60_000;

/** Shares of `projects`, queued for revocation at `dueAt`. */
function revoke(data: SquintData, projects: readonly Project[], dueAt: number): SquintData {
  const queued = projects.flatMap((project) =>
    project.share
      ? [
          {
            shareId: project.share.id,
            ownerKey: project.share.ownerKey,
            projectId: project.id,
            dueAt,
          },
        ]
      : [],
  );
  return queued.length ? { ...data, revocations: [...data.revocations, ...queued] } : data;
}

function touchProject(projects: Project[], id: string, at: number): Project[] {
  return projects.map((project) => (project.id === id ? { ...project, updatedAt: at } : project));
}

function updateComment(
  data: SquintData,
  id: string,
  at: number,
  change: (comment: Comment) => Comment,
): SquintData {
  const target = data.comments.find((comment) => comment.id === id);
  if (!target) return data;
  return {
    ...data,
    comments: data.comments.map((comment) => (comment.id === id ? change(comment) : comment)),
    projects: touchProject(data.projects, target.projectId, at),
  };
}

/** Pure state transitions. Unknown ids are no-ops, so stale UI can never corrupt data. */
export function reduce(data: SquintData, action: Action): SquintData {
  switch (action.type) {
    case "folder/create":
      return { ...data, folders: [...data.folders, action.folder] };
    case "folder/rename":
      return {
        ...data,
        folders: data.folders.map((folder) =>
          folder.id === action.id ? { ...folder, name: action.name } : folder,
        ),
      };
    case "folder/delete": {
      // Every project needs a folder, so the last folder stays.
      if (data.folders.length <= 1) return data;
      const removedProjects = data.projects.filter((project) => project.folderId === action.id);
      const removed = new Set(removedProjects.map((p) => p.id));
      // Folder deletes can't be undone, so their links are revoked right away.
      return {
        ...revoke(data, removedProjects, action.at),
        folders: data.folders.filter((folder) => folder.id !== action.id),
        projects: data.projects.filter((project) => !removed.has(project.id)),
        comments: data.comments.filter((comment) => !removed.has(comment.projectId)),
        snapshots: data.snapshots.filter((snapshot) => !removed.has(snapshot.projectId)),
      };
    }
    case "project/create":
      if (!data.folders.some((folder) => folder.id === action.project.folderId)) return data;
      return { ...data, projects: [...data.projects, action.project] };
    case "project/rename":
      return {
        ...data,
        projects: data.projects.map((project) =>
          project.id === action.id
            ? { ...project, name: action.name, updatedAt: action.at }
            : project,
        ),
      };
    case "project/move":
      if (!data.folders.some((folder) => folder.id === action.folderId)) return data;
      return {
        ...data,
        projects: data.projects.map((project) =>
          project.id === action.id
            ? { ...project, folderId: action.folderId, updatedAt: action.at }
            : project,
        ),
      };
    case "project/replace-source":
      return {
        ...data,
        projects: data.projects.map((project) =>
          project.id === action.id
            ? { ...project, source: action.source, updatedAt: action.at }
            : project,
        ),
      };
    case "project/delete":
      return {
        ...revoke(
          data,
          data.projects.filter((project) => project.id === action.id),
          action.at + REVOKE_GRACE_MS,
        ),
        projects: data.projects.filter((project) => project.id !== action.id),
        comments: data.comments.filter((comment) => comment.projectId !== action.id),
        snapshots: data.snapshots.filter((snapshot) => snapshot.projectId !== action.id),
      };
    case "project/restore":
      if (data.projects.some((project) => project.id === action.project.id)) return data;
      if (!data.folders.some((folder) => folder.id === action.project.folderId)) return data;
      return {
        ...data,
        projects: [...data.projects, action.project],
        comments: [...data.comments, ...action.comments],
        snapshots: [...data.snapshots, ...action.snapshots],
        // Undone in time: the link keeps working.
        revocations: data.revocations.filter((entry) => entry.projectId !== action.project.id),
      };
    case "comment/restore":
      if (data.comments.some((comment) => comment.id === action.comment.id)) return data;
      if (!data.projects.some((project) => project.id === action.comment.projectId)) return data;
      return { ...data, comments: [...data.comments, action.comment] };
    case "comment/add":
      if (!data.projects.some((project) => project.id === action.comment.projectId)) return data;
      return {
        ...data,
        comments: [...data.comments, action.comment],
        projects: touchProject(data.projects, action.comment.projectId, action.comment.createdAt),
      };
    case "comment/edit":
      return updateComment(data, action.id, action.at, (comment) => ({
        ...comment,
        body: action.body,
        updatedAt: action.at,
      }));
    case "comment/set-status":
      return updateComment(data, action.id, action.at, (comment) => {
        const { resolvedAt: _previous, ...rest } = comment;
        return action.status === "resolved"
          ? { ...rest, status: "resolved", resolvedAt: action.at }
          : { ...rest, status: "active" };
      });
    case "comment/delete":
      return { ...data, comments: data.comments.filter((comment) => comment.id !== action.id) };
    case "comment/set-crop":
      if (!data.comments.some((comment) => comment.id === action.id)) return data;
      return {
        ...data,
        comments: data.comments.map((comment) =>
          comment.id === action.id ? { ...comment, crop: action.crop } : comment,
        ),
      };
    case "snapshot/add":
      if (!data.projects.some((project) => project.id === action.snapshot.projectId)) return data;
      if (data.snapshots.some((snapshot) => snapshot.id === action.snapshot.id)) return data;
      return { ...data, snapshots: [...data.snapshots, action.snapshot] };
    case "snapshot/prune": {
      const prunable = prunableSnapshotIds(data, new Set(action.held));
      if (prunable.size === 0) return data;
      return {
        ...data,
        snapshots: data.snapshots.filter((snapshot) => !prunable.has(snapshot.id)),
      };
    }
    case "author/set":
      return { ...data, authorName: action.name };
    case "project/share":
      return {
        ...data,
        projects: data.projects.map((project) =>
          project.id === action.id ? { ...project, share: action.share } : project,
        ),
      };
    case "project/unshare":
      return {
        ...data,
        projects: data.projects.map((project) => {
          if (project.id !== action.id || !project.share) return project;
          const { share: _revoked, ...rest } = project;
          return rest;
        }),
      };
    case "revocation/due":
      if (!data.revocations.some((entry) => entry.projectId === action.projectId)) return data;
      return {
        ...data,
        revocations: data.revocations.map((entry) =>
          entry.projectId === action.projectId
            ? { ...entry, dueAt: Math.min(entry.dueAt, action.at) }
            : entry,
        ),
      };
    case "revocation/done":
      if (!data.revocations.some((entry) => entry.shareId === action.shareId)) return data;
      return {
        ...data,
        revocations: data.revocations.filter((entry) => entry.shareId !== action.shareId),
      };
    case "share/synced":
      return updateShare(data, action.id, (share) => ({ ...share, lastSyncedAt: action.at }));
    case "share/merge":
      return mergeShared(data, action);
  }
}
