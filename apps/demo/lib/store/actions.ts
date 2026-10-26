import { deleteBlobs, putBlob } from "../blob-store/blob-store";
import { pageImageKey } from "../blob-store/keys";
import { emitSquiggy } from "../squiggy/events";
import { scheduleBlobSweep } from "./blob-sweep";
import { newId } from "./id";
import { fitPicture } from "../image";
import { fitPages, pageByteBudget } from "../page-budget";
import { findPage, MAX_PAGES } from "./pages";
import { dispatch, getSnapshot, type Result } from "./store";
import type { Action } from "./reducer";
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
/** What couldn't be saved: one image (new or replacing a page's), several, or a PDF's pages. */
const SAVE_ERROR = {
  image: "This browser couldn't save the image. Free up some space, then try again.",
  images: "This browser couldn't save the images. Free up some space, then try again.",
  pdf: "This browser couldn't save the PDF pages. Free up some space, then try again.",
} as const;
const PROJECT_GONE = "This project is no longer here. It may have been deleted in another tab.";

/**
 * Applies a change someone made and persists it. A refused write (storage
 * full or blocked) tells Squiggy. Undo restores and background bookkeeping
 * use `dispatch` directly, so they never do.
 */
function commit(action: Action): Result {
  const result = dispatch(action);
  if (!result.ok) emitSquiggy({ type: "save-failed" });
  return result;
}

/** A picture or page that couldn't be stored in this browser. */
function storageFailed<T>(error: string): Result<T> {
  emitSquiggy({ type: "save-failed" });
  return { ok: false, error };
}

/** Runs a delete, then lets the blob sweep tidy up once undo is no longer likely. */
function withSweep(result: Result): Result {
  if (result.ok) scheduleBlobSweep();
  return result;
}

/** A delete that went through: Squiggy is surprised, and the blob sweep is scheduled. */
function deleted(item: "project" | "folder" | "comment", result: Result): Result {
  if (result.ok) emitSquiggy({ type: "item-deleted", item });
  return withSweep(result);
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
  return withValue(commit({ type: "folder/create", folder }), folder);
}

export const renameFolder = (id: string, name: string) =>
  commit({ type: "folder/rename", id, name: cleanName(name) });

/** Moves a folder into `parentId`, or to the top level (null). The reducer refuses cycles. */
export const moveFolder = (id: string, parentId: string | null) =>
  commit({ type: "folder/move", id, parentId });

/** Deletes a folder with everything inside it; shared projects inside are revoked. */
export const deleteFolder = (id: string) =>
  deleted("folder", commit({ type: "folder/delete", id, at: Date.now() }));

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
  const result = commit({ type: "project/create", project });
  if (result.ok) emitSquiggy({ type: "project-created", projectName: project.name });
  return withValue(result, project);
}

export const renameProject = (id: string, name: string) =>
  commit({ type: "project/rename", id, name: cleanName(name), at: Date.now() });

export const moveProject = (id: string, folderId: string) =>
  commit({ type: "project/move", id, folderId, at: Date.now() });

export const replaceProjectSource = (id: string, source: ProjectSource) =>
  commit({ type: "project/replace-source", id, source, at: Date.now() });

/** An image chosen in the browser (or a rendered PDF page), already downscaled (`prepareImage`). */
export interface ImageUpload {
  /** The encoded picture (WebP or JPEG), kept as a Blob rather than a data URL to spare memory. */
  blob: Blob;
  fileName: string;
  /** Natural size of the prepared image, in px. */
  width: number;
  height: number;
}

const TOO_MANY_PAGES = `A project holds up to ${MAX_PAGES} pages.`;
const NO_IMAGES = "Choose at least one image.";
/**
 * A picture that can't be stored small enough to share alongside the project's
 * other pages. Said the same way when creating and replacing, where a page
 * can't be removed.
 */
const tooDetailed = (name: string, pages: number) =>
  `${name} is too detailed to store${pages > 1 ? ` as one of ${pages} pages` : ""}. Use a smaller image, then try again.`;

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

/**
 * Stores the pictures in the blob store, then creates a page project around
 * them, in order. Each is first fitted to its share of the page budget
 * (`fitPages`), so the project can always be shared; a single image keeps
 * today's quality, and PDF pages arrive already fitted.
 */
export async function createPagesProject(input: {
  folderId: string;
  name: string;
  origin: PageOrigin;
  fileName: string;
  images: readonly ImageUpload[];
}): Promise<Result<Project>> {
  const { folderId, name, origin, fileName, images } = input;
  if (images.length === 0) return { ok: false, error: NO_IMAGES };
  if (images.length > MAX_PAGES) return { ok: false, error: TOO_MANY_PAGES };
  const fitted = await fitPages(images);
  if (!fitted.ok) {
    const failed = images[fitted.index]?.fileName ?? `Image ${fitted.index + 1}`;
    return { ok: false, error: tooDetailed(failed, images.length) };
  }
  const pages = await storePages(fitted.pictures);
  if (!pages) {
    const error =
      origin === "pdf" ? SAVE_ERROR.pdf : SAVE_ERROR[images.length > 1 ? "images" : "image"];
    return storageFailed(error);
  }
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
 * `source` with `page` showing `image`, already stored under `blobKey`, one
 * revision on, so a share uploads it again.
 */
function withPageImage(
  source: PagesSource,
  page: Page,
  image: ImageUpload,
  blobKey: string,
): PagesSource {
  const { fileName, width, height } = image;
  const rev = (page.rev ?? 0) + 1;
  const pages = source.pages.map((entry) =>
    entry.id === page.id ? { ...entry, blobKey, name: fileName, width, height, rev } : entry,
  );
  // A one-page project is named after its file; a page of many keeps the project's name.
  return { ...source, pages, ...(pages.length === 1 ? { fileName } : {}) };
}

/** Records a source whose new pictures are stored under `added`; if that fails, removes them. */
async function replaceWithStored(
  projectId: string,
  source: ProjectSource,
  added: readonly string[],
): Promise<Result> {
  const result = replaceProjectSource(projectId, source);
  if (!result.ok) await deleteBlobs(added);
  return result;
}

/**
 * Makes `image` a page's picture. A website project becomes a one-page image
 * project (keeping its address as `referenceUrl`, and moving its frame pins
 * onto the page); on a page project, the page `pageId` (else the first) gets
 * the new picture, so its comments stay on it. All or nothing: the picture
 * goes under a new key, the project is updated (size and revision with it),
 * and only then is the old picture let go (the blob sweep removes it); if
 * saving the project fails, the new picture is removed and the page is as it was.
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
    if (!page) return { ok: false, error: PROJECT_GONE };
    // Within the page's share of the budget, like the project's other pages.
    const fitted = await fitPicture(image, pageByteBudget(source.pages.length));
    if (!fitted) return { ok: false, error: tooDetailed(image.fileName, source.pages.length) };
    const blobKey = pageImageKey(newId());
    const saved = await putBlob(blobKey, fitted.blob);
    if (!saved) return storageFailed(SAVE_ERROR.image);
    return withSweep(
      await replaceWithStored(projectId, withPageImage(source, page, fitted, blobKey), [blobKey]),
    );
  }
  const pages = await storePages([image]);
  if (!pages) return storageFailed(SAVE_ERROR.image);
  const added = pages.map((entry) => entry.blobKey);
  return replaceWithStored(
    projectId,
    {
      kind: "pages",
      origin: "image",
      pages,
      fileName: image.fileName,
      ...(target.referenceUrl ? { referenceUrl: target.referenceUrl } : {}),
    },
    added,
  );
}

export const deleteProject = (id: string) =>
  deleted("project", commit({ type: "project/delete", id, at: Date.now() }));

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
  return withValue(commit({ type: "comment/add", comment }), comment);
}

export const editComment = (id: string, body: string) =>
  commit({ type: "comment/edit", id, body: body.trim(), at: Date.now() });

function commentStatus(id: string): CommentStatus | null {
  const state = getSnapshot();
  if (state.status !== "ready") return null;
  return state.data.comments.find((comment) => comment.id === id)?.status ?? null;
}

/** Resolving an active comment makes Squiggy celebrate; reopening (Undo included) doesn't. */
export function setCommentStatus(id: string, status: CommentStatus): Result {
  const resolving = status === "resolved" && commentStatus(id) === "active";
  const result = commit({ type: "comment/set-status", id, status, at: Date.now() });
  if (result.ok && resolving) emitSquiggy({ type: "comment-resolved" });
  return result;
}

export const deleteComment = (id: string) =>
  deleted("comment", commit({ type: "comment/delete", id }));

export const attachCrop = (id: string, crop: CommentCrop) =>
  commit({ type: "comment/set-crop", id, crop });

/** Records a capture whose image is already in the blob store under `blobKey`. */
export function addSnapshot(snapshot: Omit<Snapshot, "createdAt">): Result<Snapshot> {
  const saved: Snapshot = { ...snapshot, createdAt: Date.now() };
  // The snapshot it replaces is pruned later, unless comments point at it.
  return withValue(withSweep(commit({ type: "snapshot/add", snapshot: saved })), saved);
}

/** Undo for `deleteComment`. */
export const restoreComment = (comment: Comment) => dispatch({ type: "comment/restore", comment });

export const setAuthorName = (name: string) =>
  commit({ type: "author/set", name: cleanName(name) });

/** Remembers a share's secrets on the project, so the owner can copy the link and sync. */
export const shareProject = (id: string, share: ProjectShare) =>
  commit({ type: "project/share", id, share });

/** Forgets the share (after revoking it, or when its link no longer works). */
export const unshareProject = (id: string) => commit({ type: "project/unshare", id });

/** The project's delete is final (its Undo toast is gone): revoke its share link now. */
export const finalizeProjectDelete = (projectId: string) =>
  dispatch({ type: "revocation/due", projectId, at: Date.now() });

export const revocationDone = (shareId: string) => dispatch({ type: "revocation/done", shareId });
