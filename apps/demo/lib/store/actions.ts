import { deleteBlobs, putBlob } from "../blob-store/blob-store";
import { pageImageKey } from "../blob-store/keys";
import { scheduleBlobSweep } from "./blob-sweep";
import { newId } from "./id";
import { findPage, MAX_PAGES } from "./pages";
import { dispatch, getSnapshot, type Result } from "./store";
import type {
  Comment,
  CommentCrop,
  CommentStatus,
  Folder,
  Page,
  PageOrigin,
  PagesSource,
  Project,
  ProjectShare,
  ProjectSource,
  Snapshot,
} from "./types";

const NAME_LIMIT = 80;
const IMAGE_SAVE_ERROR =
  "This browser couldn't save the images. Free up some space, then try again.";
const PROJECT_GONE = "This project is no longer here. It may have been deleted in another tab.";

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

/** A new folder, at the top level or inside `parentId`. */
export function createFolder(name: string, parentId: string | null = null): Result<Folder> {
  const folder: Folder = { id: newId(), name: cleanName(name), createdAt: Date.now(), parentId };
  return withValue(dispatch({ type: "folder/create", folder }), folder);
}

export const renameFolder = (id: string, name: string) =>
  dispatch({ type: "folder/rename", id, name: cleanName(name) });

/** Moves a folder into `parentId`, or to the top level (null). The reducer refuses cycles. */
export const moveFolder = (id: string, parentId: string | null) =>
  dispatch({ type: "folder/move", id, parentId });

/** Deletes a folder with everything inside it; shared projects inside are revoked. */
export const deleteFolder = (id: string) =>
  withSweep(dispatch({ type: "folder/delete", id, at: Date.now() }));

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

/** An image chosen in the browser (or a rendered PDF page), already downscaled (`prepareImage`). */
export interface ImageUpload {
  /** The encoded picture (WebP or JPEG), kept as a Blob rather than a data URL to spare memory. */
  blob: Blob;
  fileName: string;
  /** Natural size of the prepared image, in px. */
  width: number;
  height: number;
}

const tooManyPages = `A project holds up to ${MAX_PAGES} pages.`;

/** Stores each image as a new page, all or nothing: on a refused write, none stay. */
async function storePages(images: readonly ImageUpload[]): Promise<Page[] | null> {
  const pages = images.map(({ fileName, width, height }) => {
    const id = newId();
    return { id, blobKey: pageImageKey(id), name: fileName, width, height };
  });
  const saved = await Promise.all(
    pages.map((page, index) => {
      const image = images[index];
      return image ? putBlob(page.blobKey, image.blob) : Promise.resolve(false);
    }),
  );
  if (saved.every(Boolean)) return pages;
  await deleteBlobs(pages.map((page) => page.blobKey));
  return null;
}

/** Stores the pictures in the blob store, then creates a page project around them, in order. */
export async function createPagesProject(input: {
  folderId: string;
  name: string;
  origin: PageOrigin;
  fileName: string;
  images: readonly ImageUpload[];
}): Promise<Result<Project>> {
  const { folderId, name, origin, fileName, images } = input;
  if (images.length === 0 || images.length > MAX_PAGES) return { ok: false, error: tooManyPages };
  const pages = await storePages(images);
  if (!pages) return { ok: false, error: IMAGE_SAVE_ERROR };
  const created = createProject({
    folderId,
    name,
    source: { kind: "pages", origin, pages, fileName },
  });
  if (!created.ok) await deleteBlobs(pages.map((page) => page.blobKey));
  return created;
}

function findProject(id: string): Project | null {
  const state = getSnapshot();
  return state.status === "ready"
    ? (state.data.projects.find((project) => project.id === id) ?? null)
    : null;
}

/**
 * `source` with `page` showing `image` (already stored under the page's key),
 * one revision on, so a share uploads it again.
 */
function withPageImage(source: PagesSource, page: Page, image: ImageUpload): PagesSource {
  const { fileName, width, height } = image;
  const rev = (page.rev ?? 0) + 1;
  const pages = source.pages.map((entry) =>
    entry.id === page.id ? { ...entry, name: fileName, width, height, rev } : entry,
  );
  // A one-page project is named after its file; a page of many keeps the project's name.
  return { ...source, pages, ...(pages.length === 1 ? { fileName } : {}) };
}

/**
 * Makes `image` a page's picture. A website project becomes a one-page image
 * project (keeping its address as `referenceUrl`, and moving its frame pins
 * onto the page); on a page project, the page `pageId` (else the first)
 * gets the new picture in place, so its comments stay on it.
 */
export async function replaceWithImage(
  projectId: string,
  image: ImageUpload,
  target: { referenceUrl: string | undefined; pageId: string | null },
): Promise<Result> {
  const project = findProject(projectId);
  if (!project) return { ok: false, error: PROJECT_GONE };
  const { source } = project;
  if (source.kind === "pages") {
    const page = findPage(project, target.pageId ?? undefined)?.page ?? source.pages[0];
    if (!page) return { ok: false, error: IMAGE_SAVE_ERROR };
    const saved = await putBlob(page.blobKey, image.blob);
    if (!saved) return { ok: false, error: IMAGE_SAVE_ERROR };
    return replaceProjectSource(projectId, withPageImage(source, page, image));
  }
  const pages = await storePages([image]);
  if (!pages) return { ok: false, error: IMAGE_SAVE_ERROR };
  return replaceProjectSource(projectId, {
    kind: "pages",
    origin: "image",
    pages,
    fileName: image.fileName,
    ...(target.referenceUrl ? { referenceUrl: target.referenceUrl } : {}),
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
  pageId?: string;
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
    ...(input.pageId ? { pageId: input.pageId } : {}),
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
