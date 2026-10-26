import { deleteBlobs, putBlob } from "../blob-store/blob-store";
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
import type { CaptureOutcome, PendingCrop, ViewerBackend } from "./backend";

/** Stores the crop once it's encoded, then attaches it. Best effort; the sweep tidies orphans. */
async function saveCrop(commentId: string, crop: PendingCrop): Promise<void> {
  const blob = await crop.blob;
  if (!blob) return;
  const blobKey = cropBlobKey(commentId);
  if (await putBlob(blobKey, blob)) attachCrop(commentId, { blobKey, rect: crop.rect });
}

/** Captures server-side, stores the image, then records the snapshot. */
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
  if (!(await putBlob(blobKey, result.blob))) {
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
  if (saved.ok) return { ok: true, snapshot: saved.value };
  await deleteBlobs([blobKey]);
  return { ok: false, message: saved.error };
}

/** The owner's viewer: everything goes to this browser's store. */
export const localBackend: ViewerBackend = {
  role: "owner",
  addComment(input, crop) {
    const result = addComment(input);
    if (result.ok && crop) void saveCrop(result.value.id, crop);
    return Promise.resolve(result);
  },
  setAuthorName: (name) => void setAuthorName(name),
  setCommentStatus,
  editComment,
  deleteComment,
  restoreComment,
  replaceWithImage,
  captureSnapshot,
};
