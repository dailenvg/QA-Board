import { reviewDeadline } from "../share/review-window";
import { isArchived, withArchived, withLabel } from "./archive";
import { folderMoveProblem, subtreeIds } from "./folders";
import { placeComment } from "./pages";
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
  /** Moves a folder into another (`parentId`), or to the top level (null). Never into itself. */
  | { type: "folder/move"; id: string; parentId: string | null }
  /** Deletes the folder and everything inside it, at any depth. */
  | { type: "folder/delete"; id: string; at: number }
  | { type: "project/create"; project: Project }
  | { type: "project/rename"; id: string; name: string; at: number }
  | { type: "project/move"; id: string; folderId: string; at: number }
  | { type: "project/replace-source"; id: string; source: ProjectSource; at: number }
  | { type: "project/delete"; id: string; at: number }
  /** Archives a project (an archived one keeps its dates) or unarchives it. */
  | { type: "project/archive"; id: string; archived: boolean; at: number }
  /** Gives a project a label, or takes it away (null). */
  | { type: "project/label"; id: string; label: string | null }
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
  /**
   * How long the project's link takes client comments: `hours` from the
   * link's creation (null for no limit). Ending before now closes it at once.
   */
  | { type: "share/window"; id: string; hours: number | null }
  /**
   * Puts back the window the server last confirmed, after a refused change.
   * Nothing to send: the server already has it.
   */
  | { type: "share/window-restore"; id: string; hours: number | null }
  /**
   * The link's password as the server now has it: set at `passwordSetAt`, or
   * none (null). Nothing to send: the server answered the change already.
   */
  | { type: "share/password"; id: string; passwordSetAt: number | null }
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
  // The server checked each page when the comment was posted; the owner may have removed it since.
  const comments = action.comments
    .filter((comment) => !commentIds.has(comment.id))
    .map((comment) => placeComment(comment, project));
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

/** Adds a comment where its project can show it (see `placeComment`); unknown projects are a no-op. */
function addComment(data: SquintData, comment: Comment): SquintData | null {
  const project = data.projects.find((entry) => entry.id === comment.projectId);
  return project ? { ...data, comments: [...data.comments, placeComment(comment, project)] } : null;
}

/** A new source: the project's comments move onto surfaces it has (frame pins onto its first page). */
function replaceSource(
  data: SquintData,
  action: Extract<Action, { type: "project/replace-source" }>,
) {
  const target = data.projects.find((project) => project.id === action.id);
  if (!target) return data;
  const project: Project = { ...target, source: action.source, updatedAt: action.at };
  return {
    ...data,
    projects: data.projects.map((entry) => (entry.id === action.id ? project : entry)),
    comments: data.comments.map((comment) =>
      comment.projectId === action.id ? placeComment(comment, project) : comment,
    ),
  };
}

/** Applies `change` to the project `id`; the same data when it's unknown or `change` says null. */
function updateProject(
  data: SquintData,
  id: string,
  change: (project: Project) => Project | null,
): SquintData {
  const target = data.projects.find((project) => project.id === id);
  const changed = target ? change(target) : null;
  if (!changed) return data;
  return {
    ...data,
    projects: data.projects.map((project) => (project.id === id ? changed : project)),
  };
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
    case "folder/create": {
      const { parentId } = action.folder;
      if (parentId !== null && !data.folders.some((folder) => folder.id === parentId)) return data;
      return { ...data, folders: [...data.folders, action.folder] };
    }
    case "folder/rename":
      return {
        ...data,
        folders: data.folders.map((folder) =>
          folder.id === action.id ? { ...folder, name: action.name } : folder,
        ),
      };
    case "folder/move":
      if (folderMoveProblem(data.folders, action.id, action.parentId)) return data;
      return {
        ...data,
        folders: data.folders.map((folder) =>
          folder.id === action.id ? { ...folder, parentId: action.parentId } : folder,
        ),
      };
    case "folder/delete": {
      if (!data.folders.some((folder) => folder.id === action.id)) return data;
      const folderIds = subtreeIds(data.folders, action.id);
      // Every project needs a folder, so the last folders stay.
      if (folderIds.size >= data.folders.length) return data;
      const removedProjects = data.projects.filter((project) => folderIds.has(project.folderId));
      const removed = new Set(removedProjects.map((p) => p.id));
      return {
        ...data,
        folders: data.folders.filter((folder) => !folderIds.has(folder.id)),
        projects: data.projects.filter((project) => !removed.has(project.id)),
        comments: data.comments.filter((comment) => !removed.has(comment.projectId)),
        snapshots: data.snapshots.filter((snapshot) => !removed.has(snapshot.projectId)),
      };
    }
    case "project/create":
      if (!data.folders.some((folder) => folder.id === action.project.folderId)) return data;
      if (action.project.source.kind === "pages" && action.project.source.pages.length === 0) {
        return data;
      }
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
      return replaceSource(data, action);
    case "project/delete":
      return {
        ...data,
        projects: data.projects.filter((project) => project.id !== action.id),
        comments: data.comments.filter((comment) => comment.projectId !== action.id),
        snapshots: data.snapshots.filter((snapshot) => snapshot.projectId !== action.id),
      };
    case "project/archive":
      return updateProject(data, action.id, (project) =>
        isArchived(project) === action.archived
          ? null
          : withArchived(project, action.archived, action.at),
      );
    case "project/label":
      return updateProject(data, action.id, (project) =>
        (project.label ?? null) === action.label ? null : withLabel(project, action.label),
      );
    case "project/restore":
      if (data.projects.some((project) => project.id === action.project.id)) return data;
      if (!data.folders.some((folder) => folder.id === action.project.folderId)) return data;
      return {
        ...data,
        projects: [...data.projects, action.project],
        comments: [...data.comments, ...action.comments],
        snapshots: [...data.snapshots, ...action.snapshots],
      };
    case "comment/restore":
      if (data.comments.some((comment) => comment.id === action.comment.id)) return data;
      return addComment(data, action.comment) ?? data;
    case "comment/add": {
      const added = addComment(data, action.comment);
      if (!added) return data;
      return {
        ...added,
        projects: touchProject(data.projects, action.comment.projectId, action.comment.createdAt),
      };
    }
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
    case "share/synced":
      return updateShare(data, action.id, (share) => ({ ...share, lastSyncedAt: action.at }));
    case "share/window":
    case "share/window-restore":
      return updateShare(data, action.id, (share) => ({
        ...share,
        reviewWindowHours: action.hours,
        reviewEndsAt: reviewDeadline(share.createdAt, action.hours),
      }));
    case "share/password":
      return updateShare(data, action.id, ({ passwordSetAt: _previous, ...share }) =>
        action.passwordSetAt === null ? share : { ...share, passwordSetAt: action.passwordSetAt },
      );
    case "share/merge":
      return mergeShared(data, action);
  }
}
