import { putBlob } from "../blob-store/blob-store";
import { projectImageKey } from "../blob-store/keys";
import { dataUrlToBlob } from "../image";
import { scheduleBlobSweep } from "./blob-sweep";
import { newId } from "./id";
import { dispatch, type Result } from "./store";
import type {
  Comment,
  CommentCrop,
  CommentStatus,
  Folder,
  Project,
  ProjectShare,
  ProjectSource,
  Snapshot,
} from "./types";

const NAME_LIMIT = 80;
const IMAGE_SAVE_ERROR =
  "This browser couldn't save the image. Free up some space, then try again.";

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

export const deleteFolder = (id: string) =>
  withSweep(dispatch({ type: "folder/delete", id, at: Date.now() }));

export function createProject(input: {
  /** Set when something (an image) was already stored under this project's id. */
  id?: string;
  folderId: string;
  name: string;
  source: ProjectSource;
}): Result<Project> {
  const now = Date.now();
  const project: Project = {
    id: input.id ?? newId(),
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

/** An image chosen in the browser, already downscaled (`prepareImage`). */
export interface ImageUpload {
  dataUrl: string;
  fileName: string;
}

async function storeProjectImage(projectId: string, image: ImageUpload): Promise<string | null> {
  const blobKey = projectImageKey(projectId);
  return (await putBlob(blobKey, await dataUrlToBlob(image.dataUrl))) ? blobKey : null;
}

/** Stores the picture in the blob store, then creates the image project around it. */
export async function createImageProject(input: {
  folderId: string;
  name: string;
  image: ImageUpload;
}): Promise<Result<Project>> {
  const id = newId();
  const blobKey = await storeProjectImage(id, input.image);
  if (!blobKey) return { ok: false, error: IMAGE_SAVE_ERROR };
  const { fileName } = input.image;
  return createProject({ id, ...input, source: { kind: "image", blobKey, fileName } });
}

/**
 * Makes `image` the project's picture: a website project becomes an image
 * project (keeping its address as `referenceUrl`), an image project gets a new image.
 */
export async function replaceWithImage(
  projectId: string,
  image: ImageUpload,
  referenceUrl: string | undefined,
): Promise<Result> {
  const blobKey = await storeProjectImage(projectId, image);
  if (!blobKey) return { ok: false, error: IMAGE_SAVE_ERROR };
  return replaceProjectSource(projectId, {
    kind: "image",
    blobKey,
    fileName: image.fileName,
    ...(referenceUrl ? { referenceUrl } : {}),
  });
}

export const deleteProject = (id: string) =>
  withSweep(dispatch({ type: "project/delete", id, at: Date.now() }));

/** Undo for `deleteProject`: pass the project and the comments and snapshots it had. */
export const restoreProject = (project: Project, comments: Comment[], snapshots: Snapshot[]) =>
  dispatch({ type: "project/restore", project, comments, snapshots });

export function addComment(input: {
  id?: string;
  projectId: string;
  x: number;
  y: number;
  body: string;
  author: string;
  snapshotId?: string;
}): Result<Comment> {
  const now = Date.now();
  const comment: Comment = {
    id: input.id ?? newId(),
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

/** Remembers a share's secrets on the project, so the owner can copy the link and sync. */
export const shareProject = (id: string, share: ProjectShare) =>
  dispatch({ type: "project/share", id, share });

/** Forgets the share (after revoking it, or when its link no longer works). */
export const unshareProject = (id: string) => dispatch({ type: "project/unshare", id });

/** The project's delete is final (its Undo toast is gone): revoke its share link now. */
export const finalizeProjectDelete = (projectId: string) =>
  dispatch({ type: "revocation/due", projectId, at: Date.now() });

export const revocationDone = (shareId: string) => dispatch({ type: "revocation/done", shareId });
