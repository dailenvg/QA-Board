import { pageImageKey } from "../blob-store/keys";
import { emitSquiggy } from "../squiggy/events";
import { cleanLabel } from "./archive";
import { discardWorkspaceBlob, storeWorkspaceBlob } from "../workspace-client/blob-upload";
import { newId } from "./id";
import { fitPicture } from "../image";
import { fitPages, pageByteBudget } from "../page-budget";
import { findPage, MAX_PAGES } from "./pages";
import { storedClientName } from "../share/client-name";
import { inviteResult, type InviteResult, type InvitesSent } from "../share-client/invites";
import { passwordRefusal } from "../workspace-client/mutations";
import type { SharePasswordState } from "../workspace/types";
import { dispatch, dispatchConfirmed, getSnapshot, requestDirect, type Result } from "./store";
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
/** What couldn't be uploaded: one image (new or replacing a page's), several, or a PDF's pages. */
const SAVE_ERROR = {
  image: "The image couldn't be uploaded. Check your connection and try again.",
  images: "The images couldn't be uploaded. Check your connection and try again.",
  pdf: "The PDF pages couldn't be uploaded. Check your connection and try again.",
} as const;
const PROJECT_GONE = "This project is no longer here. It may have been deleted in another tab.";

/**
 * Applies a change someone made; the workspace saves it in the background. A
 * change refused here (the workspace isn't loaded) tells Squiggy; one the
 * server refuses later is rolled back, and the workspace store tells Squiggy.
 * Undo restores use `dispatch` directly, so they never do.
 */
function commit(action: Action): Result {
  const result = dispatch(action);
  if (!result.ok) emitSquiggy({ type: "save-failed" });
  return result;
}

/** A picture or page that couldn't be uploaded. */
function storageFailed<T>(error: string): Result<T> {
  emitSquiggy({ type: "save-failed" });
  return { ok: false, error };
}

/** A delete that went through: Squiggy is surprised. */
function deleted(item: "project" | "folder" | "comment", result: Result): Result {
  if (result.ok) emitSquiggy({ type: "item-deleted", item });
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
  return withValue(commit({ type: "folder/create", folder }), folder);
}

export const renameFolder = (id: string, name: string) =>
  commit({ type: "folder/rename", id, name: cleanName(name) });

/** Moves a folder into `parentId`, or to the top level (null). The reducer refuses cycles. */
export const moveFolder = (id: string, parentId: string | null) =>
  commit({ type: "folder/move", id, parentId });

/**
 * Deletes a folder with everything inside it: its projects go to the
 * workspace's trash, and their share links stop working.
 */
export const deleteFolder = (id: string) =>
  deleted("folder", commit({ type: "folder/delete", id, at: Date.now() }));

interface ProjectInput {
  folderId: string;
  name: string;
  source: ProjectSource;
}

function newProject(input: ProjectInput): Project {
  const now = Date.now();
  return {
    id: newId(),
    folderId: input.folderId,
    name: cleanName(input.name),
    source: input.source,
    createdAt: now,
    updatedAt: now,
  };
}

export function createProject(input: ProjectInput): Result<Project> {
  const project = newProject(input);
  const result = commit({ type: "project/create", project });
  if (result.ok) emitSquiggy({ type: "project-created", projectName: project.name });
  return withValue(result, project);
}

export const renameProject = (id: string, name: string) =>
  commit({ type: "project/rename", id, name: cleanName(name), at: Date.now() });

export const moveProject = (id: string, folderId: string) =>
  commit({ type: "project/move", id, folderId, at: Date.now() });

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

/** A new page for each image, in order, each picture under a key of its own. */
function newPages(images: readonly ImageUpload[]): Page[] {
  return images.map(({ fileName, width, height }) => {
    const id = newId();
    return { id, blobKey: pageImageKey(id), name: fileName, width, height };
  });
}

/** Uploads each page's picture to the project; true once all of them are in. */
async function uploadPages(
  projectId: string,
  pages: readonly Page[],
  images: readonly ImageUpload[],
): Promise<boolean> {
  const uploaded = await Promise.all(
    pages.map((page, index) => {
      const image = images[index];
      return image
        ? storeWorkspaceBlob(projectId, page.blobKey, image.blob)
        : Promise.resolve({ ok: false });
    }),
  );
  return uploaded.every((result) => result.ok);
}

/**
 * Creates a page project around the pictures, in order, then uploads them.
 * Each is first fitted to its share of the page budget (`fitPages`), so the
 * project can always be shared; a single image keeps today's quality, and
 * PDF pages arrive already fitted. All or nothing: if the server refuses the
 * project or any picture, the project goes again (to the trash).
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
  const pages = newPages(fitted.pictures);
  const project = newProject({
    folderId,
    name,
    source: { kind: "pages", origin, pages, fileName },
  });
  const created = await dispatchConfirmed({ type: "project/create", project });
  if (!created.ok) return created;
  if (!(await uploadPages(project.id, pages, fitted.pictures))) {
    await dispatchConfirmed({ type: "project/delete", id: project.id, at: Date.now() });
    const error =
      origin === "pdf" ? SAVE_ERROR.pdf : SAVE_ERROR[images.length > 1 ? "images" : "image"];
    return storageFailed(error);
  }
  emitSquiggy({ type: "project-created", projectName: project.name });
  return { ok: true, value: project };
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

/**
 * Records a source whose new pictures are uploaded under `added`, then lets
 * the `replaced` pictures go; if the server refuses it, the new ones go instead.
 */
async function replaceWithStored(
  projectId: string,
  source: ProjectSource,
  added: readonly string[],
  replaced: readonly string[] = [],
): Promise<Result> {
  const result = await dispatchConfirmed({
    type: "project/replace-source",
    id: projectId,
    source,
    at: Date.now(),
  });
  for (const key of result.ok ? replaced : added) void discardWorkspaceBlob(projectId, key);
  return result;
}

/**
 * Makes `image` a page's picture. A website project becomes a one-page image
 * project (keeping its address as `referenceUrl`, and moving its frame pins
 * onto the page); on a page project, the page `pageId` (else the first) gets
 * the new picture, so its comments stay on it. All or nothing: the picture
 * goes under a new key, the project is updated (size and revision with it),
 * and only then is the old picture deleted; if saving the project fails, the
 * new picture is deleted and the page is as it was.
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
    const saved = await storeWorkspaceBlob(projectId, blobKey, fitted.blob);
    if (!saved.ok) return storageFailed(SAVE_ERROR.image);
    return replaceWithStored(
      projectId,
      withPageImage(source, page, fitted, blobKey),
      [blobKey],
      [page.blobKey],
    );
  }
  const pages = newPages([image]);
  if (!(await uploadPages(projectId, pages, [image]))) return storageFailed(SAVE_ERROR.image);
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

/** Archives a project, and Squiggy takes a nap; or brings it back from the archive. */
export function setProjectArchived(id: string, archived: boolean): Result {
  const result = commit({ type: "project/archive", id, archived, at: Date.now() });
  if (result.ok && archived) emitSquiggy({ type: "project-archived" });
  return result;
}

/** Gives a project a label (trimmed and capped), or takes it away with null. */
export function setProjectLabel(id: string, label: string | null): Result {
  const cleaned = label === null ? null : cleanLabel(label);
  return commit({ type: "project/label", id, label: cleaned || null });
}

export const deleteProject = (id: string) =>
  deleted("project", commit({ type: "project/delete", id, at: Date.now() }));

/** Undo for `deleteProject`: pass the project and the comments and snapshots it had. */
export const restoreProject = (project: Project, comments: Comment[], snapshots: Snapshot[]) =>
  dispatch({ type: "project/restore", project, comments, snapshots });

/** Adds a comment and resolves once the server has it; on a refusal it's gone again. */
export function addComment(input: {
  id?: string;
  projectId: string;
  x: number;
  y: number;
  body: string;
  author: string;
  snapshotId?: string;
  pageId?: string;
}): Promise<Result<Comment>> {
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
  return dispatchConfirmed({ type: "comment/add", comment }).then((result) =>
    withValue(result, comment),
  );
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

/** Records a capture whose image is already uploaded under `blobKey`. */
export function addSnapshot(snapshot: Omit<Snapshot, "createdAt">): Result<Snapshot> {
  const saved: Snapshot = { ...snapshot, createdAt: Date.now() };
  return withValue(commit({ type: "snapshot/add", snapshot: saved }), saved);
}

/** Undo for `deleteComment`. */
export const restoreComment = (comment: Comment) => dispatch({ type: "comment/restore", comment });

export const setAuthorName = (name: string) =>
  commit({ type: "author/set", name: cleanName(name) });

/**
 * Makes a new share the project's review link in the workspace, so any of
 * its browsers can copy the link and sync. Resolves with the server's answer.
 */
export const shareProject = (id: string, share: ProjectShare) =>
  dispatchConfirmed({ type: "project/share", id, share });

/**
 * Sets how long the project's link takes client comments (`hours` from its
 * creation; null for no limit). Resolves with the server's answer.
 */
export const setReviewWindow = (id: string, hours: number | null) =>
  dispatchConfirmed({ type: "share/window", id, hours });

/**
 * Names the client the project's link is for (cleaned as the server cleans
 * it; blank clears it). Resolves with the server's answer.
 */
export const setShareClientName = (id: string, name: string) =>
  dispatchConfirmed({ type: "share/client", id, clientName: storedClientName(name) });

/** Shows the window the server last confirmed again, after a refused change; sends nothing. */
export const restoreReviewWindow = (id: string, hours: number | null) =>
  dispatch({ type: "share/window-restore", id, hours });

/**
 * Sets (or, with null, removes) the password guests of the project's link
 * must enter. The password goes straight to the server, never into an action
 * or the store; once it answers, the store takes when it was set.
 */
export async function setSharePassword(id: string, password: string | null): Promise<Result> {
  const removing = password === null;
  const result = await requestDirect<SharePasswordState>(
    removing ? "DELETE" : "PUT",
    `/projects/${encodeURIComponent(id)}/share-link/password`,
    removing ? {} : { password },
  );
  if (!result.ok) return { ok: false, error: passwordRefusal(result.status, removing) };
  dispatch({ type: "share/password", id, passwordSetAt: result.value.passwordSetAt });
  return { ok: true, value: undefined };
}

/**
 * Emails the project's review link to `addresses` from the workspace. Nothing
 * of it goes through the store but how many people it has now reached.
 */
export async function sendShareInvites(
  id: string,
  addresses: readonly string[],
): Promise<InviteResult> {
  const answer = await requestDirect<InvitesSent>(
    "POST",
    `/projects/${encodeURIComponent(id)}/share-link/invites`,
    { addresses },
  );
  const result = inviteResult(answer, Date.now());
  if (result.ok) dispatch({ type: "share/invited", id, invitedCount: result.invitedCount });
  return result;
}

/**
 * Revokes the project's review link on the server (one already gone counts as
 * done) and forgets it. Resolves with the server's answer.
 */
export const unshareProject = (id: string) => dispatchConfirmed({ type: "project/unshare", id });
