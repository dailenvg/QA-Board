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
/** 413 on a comment: the share holds its maximum of comments, or its 40 MB of images. */
const SHARE_FULL =
  "Your comment wasn't sent: this review is out of space for new comments. Ask the project owner to make room, then retry.";
/** 413 on a capture: the share holds its maximum of snapshots, or its 40 MB of images. */
const SNAPSHOTS_FULL =
  "This review is out of space for new snapshots. Comment on the current snapshot, or ask the project owner to make room.";
/** 409 pending: the same comment is still being saved by an earlier try. */
const STILL_SENDING =
  "Your comment isn't posted yet: an earlier try is still being saved. Wait two minutes, then retry. It won't post twice.";
/** 422 unknown-page: the owner removed the page while the comment was being written. */
const PAGE_GONE =
  "Your comment wasn't sent: its page was removed from this review. Copy your text, then reload the page.";
const NOT_SENT_DEFAULT = "Your comment wasn't sent. Retry in a moment.";
/** 403 review-closed: the share's 72-hour review window is over. */
const REVIEW_CLOSED =
  "Your comment wasn't sent: the review window has closed. Copy your text to keep it.";
const CAPTURE_CLOSED = "The review window has closed, so new snapshots can't be taken.";

interface ClientBackendOptions {
  token: string;
  store: ClientStore;
  blobs: ServerBlobs;
}

const ownerOnly = () => ({ ok: false as const, error: OWNER_ONLY });

function commentForm(comment: Comment, blob: Blob | null, crop: PendingCrop | null): FormData {
  const { id, x, y, body, author, snapshotId, pageId } = comment;
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
      ...(pageId ? { pageId } : {}),
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
        ...(input.pageId ? { pageId: input.pageId } : {}),
      };
      const blob = crop ? await crop.blob : null;
      const result = await api.addComment(commentForm(comment, blob, crop));
      // 409 pending: an earlier try of this comment is still being saved (or died mid-way
      // and is reclaimable a minute later). Not delivered yet: keep the draft, try again.
      if (!result.ok && result.status === 409 && result.error === "pending") {
        return { ok: false, error: STILL_SENDING };
      }
      // 409 exists: the comment is visible, so an earlier try got through even though its
      // answer didn't arrive. Counting it as sent can't lose it or post it twice.
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
      if (result.error === "review-closed") {
        store.markReviewClosed();
        return { ok: false, error: REVIEW_CLOSED };
      }
      if (result.error === "share-full") return { ok: false, error: SHARE_FULL };
      if (result.error === "unknown-page") return { ok: false, error: PAGE_GONE };
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
      if (result.error === "review-closed") {
        store.markReviewClosed();
        return { ok: false, message: CAPTURE_CLOSED };
      }
      if (result.error === "share-full") return { ok: false, message: SNAPSHOTS_FULL };
      const code = isCaptureErrorCode(result.error)
        ? result.error
        : result.status === 0
          ? "offline"
          : "failed";
      return { ok: false, message: CAPTURE_MESSAGES[code] };
    },
  };
}
