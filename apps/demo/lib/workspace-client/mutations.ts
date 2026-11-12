import { windowChoice } from "../share/review-window";
import type { Action } from "../store/reducer";
import type { Comment, Snapshot, SquintData } from "../store/types";

/**
 * What each store action asks of the workspace API (`/api/w/<id>/…`). The
 * store applies an action at once (optimistic); these requests then make the
 * server match, in order. Everything is derived from the state before and
 * after the action, so an action the reducer ignored sends nothing.
 */

export interface ServerWrite {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  /** Below `/api/w/<workspaceId>`. */
  path: string;
  body: unknown;
  /** Answers that still mean done: a 404 on a delete, a 409 on a re-add. */
  tolerate?: readonly number[];
}

const PROJECT_GONE = "This project is no longer here. It may have been deleted in another tab.";
const FOLDER_GONE = "This folder is no longer here. It may have been deleted in another tab.";
const COMMENT_GONE = "This comment is no longer here. It may have been deleted in another tab.";
const LINK_GONE = "This review link is no longer here. It may have been revoked in another tab.";
export const SAVE_FAILED =
  "That change didn't save and was undone. Check your connection and try again.";

const segment = encodeURIComponent;
const folderPath = (id: string) => `/folders/${segment(id)}`;
const projectPath = (id: string) => `/projects/${segment(id)}`;
const commentsPath = (projectId: string) => `${projectPath(projectId)}/comments`;
const commentPath = (projectId: string, id: string) => `${commentsPath(projectId)}/${segment(id)}`;
const snapshotsPath = (projectId: string) => `${projectPath(projectId)}/snapshots`;
const linkPath = (projectId: string) => `${projectPath(projectId)}/share-link`;

const write = (
  method: ServerWrite["method"],
  path: string,
  body: unknown = {},
  tolerate?: readonly number[],
): ServerWrite => ({ method, path, body, ...(tolerate ? { tolerate } : {}) });

/** The comment as the API takes it: whose it is comes from the request (`fromShare`), not the body. */
function commentBody(comment: Comment) {
  const { projectId: _project, fromClient: _client, ...body } = comment;
  return body;
}

function snapshotBody(snapshot: Snapshot) {
  const { projectId: _project, ...body } = snapshot;
  return body;
}

function added<T extends { id: string }>(before: readonly T[], after: readonly T[]): T[] {
  const ids = new Set(before.map((entry) => entry.id));
  return after.filter((entry) => !ids.has(entry.id));
}

function removed<T extends { id: string }>(before: readonly T[], after: readonly T[]): T[] {
  return added(after, before);
}

/** The project a comment belongs to, before the action (edits, deletes). */
function commentProject(data: SquintData, id: string): string | null {
  return data.comments.find((comment) => comment.id === id)?.projectId ?? null;
}

function commentWrite(
  data: SquintData,
  id: string,
  change: (projectId: string) => ServerWrite,
): ServerWrite[] {
  const projectId = commentProject(data, id);
  return projectId ? [change(projectId)] : [];
}

/**
 * Undoing a delete. A client's comment goes back as a client's while the guest's original is
 * still on the review link (the server checks); once the link is gone it can't be shown to be
 * one (404), so the second write saves it as the member's. Either way only one lands: after
 * the first, the second's id is taken (409).
 */
function restoreWrites(comment: Comment): ServerWrite[] {
  const path = commentsPath(comment.projectId);
  const body = commentBody(comment);
  const plain = write("POST", path, body, [409]);
  return comment.fromClient
    ? [write("POST", path, { ...body, fromShare: true }, [404, 409]), plain]
    : [plain];
}

/** Client additions a pull merged: their snapshots first, which comments may sit on. */
function mergeWrites(before: SquintData, after: SquintData, projectId: string): ServerWrite[] {
  const share = after.projects.find((project) => project.id === projectId)?.share;
  if (!share) return [];
  return [
    ...added(before.snapshots, after.snapshots).map((snapshot) =>
      write("POST", snapshotsPath(projectId), snapshotBody(snapshot), [409]),
    ),
    // Guests' comments: saved without an author account (the server checks they're a guest's).
    ...added(before.comments, after.comments).map((comment) =>
      write("POST", commentsPath(projectId), { ...commentBody(comment), fromShare: true }, [409]),
    ),
    write("PATCH", linkPath(projectId), {
      cursor: share.cursor,
      lastSyncedAt: share.lastSyncedAt ?? Date.now(),
    }),
  ];
}

/**
 * The requests that make the server match `after`. A folder delete trashes
 * the projects inside first (the server only deletes empty folders), so they
 * stay restorable for the trash's grace period.
 */
export function writesFor(action: Action, before: SquintData, after: SquintData): ServerWrite[] {
  switch (action.type) {
    case "folder/create": {
      const { id, name, parentId, createdAt } = action.folder;
      // A 409 is this very folder (ids are unique): made by a retry, or another tab filing.
      return [write("POST", "/folders", { id, name, parentId, createdAt }, [409])];
    }
    case "folder/rename":
      return [write("PATCH", folderPath(action.id), { name: action.name })];
    case "folder/move":
      return [write("PATCH", folderPath(action.id), { parentId: action.parentId })];
    case "folder/delete":
      return [
        ...removed(before.projects, after.projects).map((project) =>
          write("DELETE", projectPath(project.id), {}, [404]),
        ),
        write("DELETE", folderPath(action.id), {}, [404]),
      ];
    case "project/create": {
      const { id, folderId, name, source, createdAt } = action.project;
      return [write("POST", "/projects", { id, folderId, name, source, createdAt })];
    }
    case "project/rename":
      return [write("PATCH", projectPath(action.id), { name: action.name })];
    case "project/move":
      return [write("PATCH", projectPath(action.id), { folderId: action.folderId })];
    case "project/replace-source":
      return [write("PATCH", projectPath(action.id), { source: action.source })];
    case "project/delete":
      return [write("DELETE", projectPath(action.id), {}, [404])];
    case "project/archive":
      return [write("PUT", `${projectPath(action.id)}/archive`, { archived: action.archived })];
    case "project/label":
      return [write("PUT", `${projectPath(action.id)}/label`, { label: action.label })];
    case "project/restore":
      return [write("POST", `${projectPath(action.project.id)}/restore`)];
    case "comment/add":
      return [write("POST", commentsPath(action.comment.projectId), commentBody(action.comment))];
    case "comment/restore":
      return restoreWrites(action.comment);
    case "comment/edit":
      return commentWrite(before, action.id, (projectId) =>
        write("PATCH", commentPath(projectId, action.id), { body: action.body }),
      );
    case "comment/set-status":
      return commentWrite(before, action.id, (projectId) =>
        write("PATCH", commentPath(projectId, action.id), { status: action.status }),
      );
    case "comment/set-crop":
      return commentWrite(before, action.id, (projectId) =>
        write("PATCH", commentPath(projectId, action.id), { crop: action.crop }),
      );
    case "comment/delete":
      return commentWrite(before, action.id, (projectId) =>
        write("DELETE", commentPath(projectId, action.id), {}, [404]),
      );
    case "snapshot/add":
      return [
        write("POST", snapshotsPath(action.snapshot.projectId), snapshotBody(action.snapshot)),
      ];
    case "snapshot/prune":
      return removed(before.snapshots, after.snapshots).map((snapshot) =>
        write("DELETE", `${snapshotsPath(snapshot.projectId)}/${segment(snapshot.id)}`, {}, [404]),
      );
    case "author/set":
      return [write("PUT", "/author", { name: action.name })];
    case "project/share": {
      const { id, token, ownerKey, reviewWindowHours } = action.share;
      const reviewWindow = windowChoice(reviewWindowHours);
      return [write("PUT", linkPath(action.id), { shareId: id, token, ownerKey, reviewWindow })];
    }
    case "share/window-restore":
      return [];
    case "share/window":
      return [
        write("PATCH", `${linkPath(action.id)}/settings`, {
          reviewWindow: windowChoice(action.hours),
        }),
      ];
    case "project/unshare":
      return [write("DELETE", linkPath(action.id), {}, [404])];
    case "share/synced": {
      const share = after.projects.find((project) => project.id === action.id)?.share;
      return share
        ? [write("PATCH", linkPath(action.id), { cursor: share.cursor, lastSyncedAt: action.at })]
        : [];
    }
    case "share/merge":
      return mergeWrites(before, after, action.id);
  }
}

/** What to tell the person when the server refused `action` with `status` (0: no answer). */
export function refusalMessage(action: Action, status: number): string {
  const gone = status === 404 || status === 422;
  if (!gone) return SAVE_FAILED;
  if (action.type.startsWith("folder/")) return FOLDER_GONE;
  if (action.type === "project/create" || action.type === "project/move") {
    return status === 422 ? FOLDER_GONE : PROJECT_GONE;
  }
  if (action.type.startsWith("comment/") && action.type !== "comment/add") {
    return status === 404 ? COMMENT_GONE : SAVE_FAILED;
  }
  if (action.type === "share/window") return LINK_GONE;
  return PROJECT_GONE;
}
