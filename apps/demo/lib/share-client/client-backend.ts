import { CAPTURE_MESSAGES } from "../capture/messages";
import { isCaptureErrorCode } from "../capture/types";
import { cleanName } from "../store/actions";
import { newId } from "../store/id";
import type { Comment } from "../store/types";
import {
  OWNER_ONLY,
  type CaptureOutcome,
  type NewComment,
  type PendingCrop,
  type ViewerBackend,
} from "../viewer-backend/backend";
import { clientApi } from "./api";
import { SHARED_PROJECT_ID, type ClientStore } from "./client-store";
import type { ServerBlobs } from "./server-blobs";

const GONE = "This review link no longer works.";
const NOT_SENT = "Your comment couldn't be sent.";

interface ClientBackendOptions {
  token: string;
  store: ClientStore;
  blobs: ServerBlobs;
  /** Reports a comment that didn't reach the server, with a way to send it again. */
  onSendFailed: (message: string, retry: () => void) => void;
}

const ownerOnly = () => ({ ok: false as const, error: OWNER_ONLY });

/**
 * A shared link's viewer: comments and snapshots go to the server. A new
 * comment shows at once and is confirmed (or withdrawn) when the server answers.
 */
export function createClientBackend({
  token,
  store,
  blobs,
  onSendFailed,
}: ClientBackendOptions): ViewerBackend {
  const api = clientApi(token);

  const send = async (comment: Comment, crop: PendingCrop | null): Promise<void> => {
    const blob = crop ? await crop.blob : null;
    if (blob) blobs.hold(`crop:${comment.id}`, blob);
    const form = new FormData();
    const { id, x, y, body, author, snapshotId } = comment;
    form.set(
      "comment",
      JSON.stringify({
        id,
        x,
        y,
        body,
        author,
        ...(snapshotId ? { snapshotId } : {}),
        ...(blob && crop ? { crop: { rect: crop.rect } } : {}),
      }),
    );
    if (blob) form.set("crop", blob, "crop.png");
    const result = await api.addComment(form);
    if (result.ok) {
      store.settle(comment.id, result.value);
      return;
    }
    store.settle(comment.id, null);
    if (result.status === 404) {
      store.markGone();
      return;
    }
    onSendFailed(NOT_SENT, () => {
      store.addPending(comment);
      void send(comment, blob && crop ? { blob: Promise.resolve(blob), rect: crop.rect } : null);
    });
  };

  return {
    role: "client",
    addComment(input: NewComment, crop) {
      const now = Date.now();
      const id = newId();
      const comment: Comment = {
        id,
        projectId: SHARED_PROJECT_ID,
        x: input.x,
        y: input.y,
        body: input.body.trim(),
        author: cleanName(input.author),
        status: "active",
        createdAt: now,
        updatedAt: now,
        ...(input.snapshotId ? { snapshotId: input.snapshotId } : {}),
        ...(crop ? { crop: { blobKey: `crop:${id}`, rect: crop.rect } } : {}),
      };
      store.addPending(comment);
      void send(comment, crop);
      return { ok: true, value: comment };
    },
    setAuthorName: (name) => store.setAuthorName(cleanName(name)),
    setCommentStatus: ownerOnly,
    editComment: ownerOnly,
    deleteComment: ownerOnly,
    restoreComment: ownerOnly,
    replaceWithImage: () => Promise.resolve(ownerOnly()),
    async captureSnapshot(_projectId, _url, width, signal): Promise<CaptureOutcome | null> {
      const result = await api.capture(width, signal);
      if (signal.aborted) return null;
      if (result.ok) {
        store.addSnapshot(result.value);
        return {
          ok: true,
          snapshot: {
            ...result.value,
            projectId: SHARED_PROJECT_ID,
            blobKey: `snapshot:${result.value.id}`,
          },
        };
      }
      if (result.status === 404) {
        store.markGone();
        return { ok: false, message: GONE };
      }
      const code = isCaptureErrorCode(result.error)
        ? result.error
        : result.status === 0
          ? "offline"
          : "failed";
      return { ok: false, message: CAPTURE_MESSAGES[code] };
    },
  };
}
