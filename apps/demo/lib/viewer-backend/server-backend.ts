import { cropBlobKey, snapshotBlobKey } from "../blob-store/keys";
import { CAPTURE_MESSAGES } from "../capture/messages";
import { requestCapture } from "../capture/request-capture";
import { emitSquiggy } from "../squiggy/events";
import {
  addComment,
  addSnapshot,
  attachCrop,
  deleteComment,
  editComment,
  replaceWithImage,
  restoreComment,
  setAuthorName,
  setCommentStatus,
} from "../store/actions";
import { newId } from "../store/id";
import { storeWorkspaceBlob } from "../workspace-client/blob-upload";
import type { CaptureOutcome, PendingCrop, ViewerBackend } from "./backend";

/**
 * Uploads the crop once it's encoded, then attaches it. Best effort: a
 * comment whose crop never arrives just shows without one.
 */
async function saveCrop(projectId: string, commentId: string, crop: PendingCrop): Promise<void> {
  const blob = await crop.blob;
  if (!blob) return;
  const blobKey = cropBlobKey(commentId);
  const uploaded = await storeWorkspaceBlob(projectId, blobKey, blob);
  if (uploaded.ok) attachCrop(commentId, { blobKey, rect: crop.rect });
}

/** Captures server-side, uploads the image to the workspace, then records the snapshot. */
async function captureSnapshot(
  projectId: string,
  url: string,
  width: number,
  signal: AbortSignal,
): Promise<CaptureOutcome | null> {
  const result = await requestCapture(url, width, signal);
  if (signal.aborted) return null;
  if (!result.ok) return { ok: false, message: CAPTURE_MESSAGES[result.failure] };
  const id = newId();
  const blobKey = snapshotBlobKey(id);
  const uploaded = await storeWorkspaceBlob(projectId, blobKey, result.blob);
  if (!uploaded.ok) {
    emitSquiggy({ type: "save-failed" });
    return { ok: false, message: CAPTURE_MESSAGES.storage };
  }
  const { width: pageWidth, height, scale } = result;
  const saved = addSnapshot({
    id,
    projectId,
    width: pageWidth,
    height,
    blobKey,
    sourceUrl: url,
    ...(scale < 1 ? { scale } : {}),
  });
  return saved.ok ? { ok: true, snapshot: saved.value } : { ok: false, message: saved.error };
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
  editComment,
  deleteComment,
  restoreComment,
  replaceWithImage,
  captureSnapshot,
};
