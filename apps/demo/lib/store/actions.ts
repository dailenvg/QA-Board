import { scheduleBlobSweep } from "./blob-sweep";
import { newId } from "./id";
import { dispatch, type Result } from "./store";
import type {
  Comment,
  CommentCrop,
  CommentStatus,
  Folder,
  Project,
  ProjectSource,
  Snapshot,
} from "./types";

const NAME_LIMIT = 80;

/** Runs a delete, then lets the blob sweep tidy up once undo is no longer likely. */
function withSweep(result: Result): Result {
  if (result.ok) scheduleBlobSweep();
  return result;
}

/** Trims and caps user-entered names. */
export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, NAME_LIMIT);
}

function withValue<T>(result: Result, value: T): Result<T> {
  return result.ok ? { ok: true, value } : result;
}

export function createFolder(name: string): Result<Folder> {
  const folder: Folder = { id: newId(), name: cleanName(name), createdAt: Date.now() };
  return withValue(dispatch({ type: "folder/create", folder }), folder);
}

export const renameFolder = (id: string, name: string) =>
  dispatch({ type: "folder/rename", id, name: cleanName(name) });

export const deleteFolder = (id: string) => withSweep(dispatch({ type: "folder/delete", id }));

export function createProject(input: {
  folderId: string;
  name: string;
  source: ProjectSource;
}): Result<Project> {
  const now = Date.now();
  const project: Project = {
    id: newId(),
    folderId: input.folderId,
    name: cleanName(input.name),
    source: input.source,
    createdAt: now,
    updatedAt: now,
  };
  return withValue(dispatch({ type: "project/create", project }), project);
}

export const renameProject = (id: string, name: string) =>
  dispatch({ type: "project/rename", id, name: cleanName(name), at: Date.now() });

export const moveProject = (id: string, folderId: string) =>
  dispatch({ type: "project/move", id, folderId, at: Date.now() });

export const replaceProjectSource = (id: string, source: ProjectSource) =>
  dispatch({ type: "project/replace-source", id, source, at: Date.now() });

export const deleteProject = (id: string) => withSweep(dispatch({ type: "project/delete", id }));

/** Undo for `deleteProject`: pass the project and the comments and snapshots it had. */
export const restoreProject = (project: Project, comments: Comment[], snapshots: Snapshot[]) =>
  dispatch({ type: "project/restore", project, comments, snapshots });

export function addComment(input: {
  projectId: string;
  x: number;
  y: number;
  body: string;
  author: string;
  snapshotId?: string;
}): Result<Comment> {
  const now = Date.now();
  const comment: Comment = {
    id: newId(),
    projectId: input.projectId,
    x: input.x,
    y: input.y,
    body: input.body.trim(),
    author: cleanName(input.author),
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...(input.snapshotId ? { snapshotId: input.snapshotId } : {}),
  };
  return withValue(dispatch({ type: "comment/add", comment }), comment);
}

export const editComment = (id: string, body: string) =>
  dispatch({ type: "comment/edit", id, body: body.trim(), at: Date.now() });

export const setCommentStatus = (id: string, status: CommentStatus) =>
  dispatch({ type: "comment/set-status", id, status, at: Date.now() });

export const deleteComment = (id: string) => withSweep(dispatch({ type: "comment/delete", id }));

export const attachCrop = (id: string, crop: CommentCrop) =>
  dispatch({ type: "comment/set-crop", id, crop });

/** Records a capture whose image is already in the blob store under `blobKey`. */
export function addSnapshot(snapshot: Omit<Snapshot, "createdAt">): Result<Snapshot> {
  const saved: Snapshot = { ...snapshot, createdAt: Date.now() };
  // The snapshot it replaces is pruned later, unless comments point at it.
  return withValue(withSweep(dispatch({ type: "snapshot/add", snapshot: saved })), saved);
}

/** Undo for `deleteComment`. */
export const restoreComment = (comment: Comment) => dispatch({ type: "comment/restore", comment });

export const setAuthorName = (name: string) =>
  dispatch({ type: "author/set", name: cleanName(name) });
