import { CAPTURE_MESSAGES } from "../capture/messages";
import { isCaptureErrorCode } from "../capture/types";
import { cleanName } from "../store/actions";
import type { Result } from "../store/store";
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

const GONE = "This link no longer works. Ask the project owner for a new one.";
const NOT_SENT: Record<number, string> = {
  0: "Your comment wasn't sent: Squint couldn't reach the server. Check your connection, then retry.",
  413: "Your comment wasn't sent: its screenshot is too large. Retry to send it again.",
  429: "Your comment wasn't sent: too many comments in a short time. Wait a moment, then retry.",
};
/** 413 with room for no more images: the share is at its 40 MB limit. */
const SHARE_FULL =
  "Your comment wasn't sent: this review is out of space for screenshots. Ask the project owner to make room, then retry.";
const NOT_SENT_DEFAULT = "Your comment wasn't sent. Retry in a moment.";

interface ClientBackendOptions {
  token: string;
  store: ClientStore;
  blobs: ServerBlobs;
}

const ownerOnly = () => ({ ok: false as const, error: OWNER_ONLY });

function commentForm(comment: Comment, blob: Blob | null, crop: PendingCrop | null): FormData {
  const { id, x, y, body, author, snapshotId } = comment;
  const form = new FormData();
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
  return form;
}

/**
 * A shared link's viewer: comments and snapshots go to the server. A comment
 * counts as posted only once the server has it; until then the composer keeps
 * the text, and sending again reuses the same id, so it can't post twice.
 */
export function createClientBackend({ token, store, blobs }: ClientBackendOptions): ViewerBackend {
  const api = clientApi(token);

  return {
    role: "client",
    async addComment(input: NewComment, crop): Promise<Result<Comment>> {
      const now = Date.now();
      const comment: Comment = {
        id: input.id,
        projectId: SHARED_PROJECT_ID,
        x: input.x,
        y: input.y,
        body: input.body.trim(),
        author: cleanName(input.author),
        status: "active",
        createdAt: now,
        updatedAt: now,
        ...(input.snapshotId ? { snapshotId: input.snapshotId } : {}),
      };
      const blob = crop ? await crop.blob : null;
      const result = await api.addComment(commentForm(comment, blob, crop));
      // 409: an earlier try got through even though its answer didn't arrive.
      if (result.ok || result.status === 409) {
        if (blob) blobs.hold(`crop:${comment.id}`, blob);
        if (result.ok) store.addComment(result.value);
        else {
          const view = await api.view();
          if (view.ok) store.setView(view.value);
        }
        return {
          ok: true,
          value:
            blob && crop
              ? { ...comment, crop: { blobKey: `crop:${comment.id}`, rect: crop.rect } }
              : comment,
        };
      }
      if (result.status === 404) {
        store.markGone();
        return { ok: false, error: GONE };
      }
      if (result.error === "share-full") return { ok: false, error: SHARE_FULL };
      return { ok: false, error: NOT_SENT[result.status] ?? NOT_SENT_DEFAULT };
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
