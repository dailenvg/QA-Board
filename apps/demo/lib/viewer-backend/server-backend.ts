import { cropBlobKey, snapshotBlobKey } from "../blob-store/keys";
import { captureKey, createInFlight, unlessAborted } from "../capture/in-flight";
import { captureFailed } from "../capture/messages";
import { clampWidth } from "../capture/types";
import { CLIENT_CAPTURE_TIMEOUT_MS } from "../capture/use-capture";
import { CROP_ATTEMPTS, cropBackoff, wait } from "../crop/crop-retry";
import { requestCapture } from "../capture/request-capture";
import { emitSquiggy } from "../squiggy/events";
import { BREAKPOINT_WIDTH } from "../store/breakpoints";
import {
  addComment,
  addReply,
  addSnapshot,
  attachCrop,
  deleteComment,
  deleteReply,
  editComment,
  editReply,
  hasProject,
  replaceWithImage,
  restoreComment,
  restoreReply,
  setAuthorName,
  setCommentPriority,
  setCommentStatus,
  setCommentTeamOnly,
  setReplyTeamOnly,
} from "../store/actions";
import { newId } from "../store/id";
import { storeWorkspaceBlob } from "../workspace-client/blob-upload";
import { SAVE_FAILED } from "../workspace-client/mutations";
import { REPLY_NOT_SENT, type CaptureOutcome, type ReadyCrop, type ViewerBackend } from "./backend";

/**
 * Uploads the crop, then attaches it: up to `CROP_ATTEMPTS` tries with a
 * short backoff. The comment is already saved, so one whose crop never
 * arrives shows without it.
 */
async function saveCrop(projectId: string, commentId: string, crop: ReadyCrop): Promise<void> {
  const blobKey = cropBlobKey(commentId);
  for (let attempt = 0; attempt < CROP_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await wait(cropBackoff(attempt));
    const uploaded = await storeWorkspaceBlob(projectId, blobKey, crop.blob);
    if (uploaded.ok) {
      attachCrop(commentId, { blobKey, rect: crop.rect });
      return;
    }
  }
}

/** A new project's first snapshot, once the project was deleted: nothing to keep, nothing failed. */
const PROJECT_GONE: CaptureOutcome = captureFailed("failed");

/**
 * Captures server-side, uploads the image to the workspace, then records the
 * snapshot. A `background` capture (`captureNewWebsite`) skips the upload once
 * its project is gone, and a project the server no longer has (404) isn't a
 * failed save either.
 */
async function captureSnapshot(
  projectId: string,
  url: string,
  width: number,
  signal: AbortSignal,
  background = false,
): Promise<CaptureOutcome | null> {
  const result = await requestCapture(url, width, signal);
  if (signal.aborted) return null;
  if (!result.ok) return captureFailed(result.failure);
  if (background && !hasProject(projectId)) return PROJECT_GONE;
  const id = newId();
  const blobKey = snapshotBlobKey(id);
  const uploaded = await storeWorkspaceBlob(projectId, blobKey, result.blob);
  if (!uploaded.ok) {
    if (background && uploaded.status === 404) return PROJECT_GONE;
    emitSquiggy({ type: "save-failed" });
    return captureFailed("storage");
  }
  const { width: pageWidth, height, scale, partial } = result;
  const saved = addSnapshot({
    id,
    projectId,
    width: pageWidth,
    height,
    blobKey,
    sourceUrl: url,
    ...(scale < 1 ? { scale } : {}),
  });
  if (!saved.ok) return { ok: false, message: saved.error };
  return { ok: true, snapshot: saved.value, ...(partial ? { partial } : {}) };
}

/** New website projects' first snapshots while they're taken (`captureNewWebsite`). */
const firstCaptures = createInFlight<CaptureOutcome | null>();

/** What the viewer captures first: the Desktop breakpoint, which it opens on. */
const FIRST_WIDTH = clampWidth(BREAKPOINT_WIDTH.desktop);

/**
 * Starts a new website project's first snapshot as soon as it's created, so
 * it's often there by the time the project opens. Nothing waits on it: it
 * lands in the workspace like any capture, and the viewer joins it while it
 * runs rather than starting another. A failure says nothing; the viewer
 * captures again on its own when it finds no snapshot.
 */
export function captureNewWebsite(projectId: string, url: string): void {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_CAPTURE_TIMEOUT_MS);
  // Only its timer aborts it, so an aborted capture took too long (as a viewer waiting on it says).
  const capture = async (): Promise<CaptureOutcome> =>
    (await captureSnapshot(projectId, url, FIRST_WIDTH, controller.signal, true)) ??
    captureFailed("timeout");
  void firstCaptures
    .run(captureKey(projectId, url, FIRST_WIDTH), capture)
    .catch(() => null)
    .finally(() => clearTimeout(timer));
}

/**
 * The signed-in owner's viewer: every change goes to the workspace store,
 * which shows it at once and saves it to the server (`lib/workspace-client`).
 */
export const serverBackend: ViewerBackend = {
  role: "owner",
  async addComment(input, crop) {
    const result = await addComment(input);
    if (result.ok && crop) void saveCrop(input.projectId, result.value.id, crop);
    return result;
  },
  setAuthorName: (name) => void setAuthorName(name),
  setCommentStatus,
  setCommentPriority,
  editComment,
  setCommentTeamOnly,
  deleteComment,
  restoreComment,
  // The store's generic refusal is about the change ("didn't save and was undone"), so it's
  // worded for the box, which keeps the words; a specific one (the comment is gone, not allowed,
  // signed out) says what it says, since retrying won't help.
  async addReply(input) {
    const result = await addReply(input);
    if (result.ok || result.error !== SAVE_FAILED) return result;
    return { ok: false, error: REPLY_NOT_SENT };
  },
  editReply,
  setReplyTeamOnly,
  deleteReply,
  restoreReply,
  replaceWithImage,
  // Joins a new project's first snapshot if it's still being taken; leaving stops only the wait.
  captureSnapshot(projectId, url, width, signal) {
    const first = firstCaptures.join(captureKey(projectId, url, width));
    return first ? unlessAborted(first, signal) : captureSnapshot(projectId, url, width, signal);
  },
};
