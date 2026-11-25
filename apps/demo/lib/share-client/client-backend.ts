import { captureFailed } from "../capture/messages";
import { sentPart } from "../client-info/schema";
import { isCaptureErrorCode } from "../capture/types";
import { CROP_ATTEMPTS, cropBackoff, wait } from "../crop/crop-retry";
import { extensionFor } from "../export/paths";
import { cleanName } from "../store/actions";
import type { Result } from "../store/store";
import type { Comment, Reply } from "../store/types";
import type { ClientComment, PostedComment, SharedReply } from "../share/types";
import {
  NOT_SENT as NOT_SENT_DEFAULT,
  OWNER_ONLY,
  REPLY_NOT_SENT,
  type CaptureOutcome,
  type EditOutcome,
  type NewComment,
  type NewReply,
  type ReadyCrop,
  type ViewerBackend,
} from "../viewer-backend/backend";
import { clientApi, type ApiResult } from "./api";
import { SHARED_PROJECT_ID, toReply, type ClientStore } from "./client-store";
import type { ServerBlobs } from "./server-blobs";
import { isPasswordRequired, isPaused } from "./unlock";

const GONE = "This link no longer works. Ask the project owner for a new one.";
const NOT_SENT: Record<number, string> = {
  0: "Your comment wasn't sent: Squint couldn't reach the server. Check your connection, then retry.",
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
/** 403 review-closed: the share's review window is over. */
const REVIEW_CLOSED =
  "Your comment wasn't sent: the review window has closed. Copy your text to keep it.";
const CAPTURE_CLOSED = "The review window has closed, so new snapshots can't be taken.";
/** 401 password-required: the link's password changed, or the guest pass ran out. */
const LOCKED = "Your comment wasn't sent: this link needs its password again. Your text is kept.";
const CAPTURE_LOCKED = "This link needs its password again before a new snapshot can be taken.";

/** A client's edit of their own comment (4.12), by what the server answered. */
const EDIT_LOCKED =
  "The team resolved this comment while you were editing, so it can't be edited now. Your text is still here to copy.";
const EDIT_CLOSED =
  "The review window has closed, so comments can't be edited now. Your text is still here to copy.";
/** 404: the team deleted it, or this browser's key no longer matches; they answer the same. */
const EDIT_GONE = "This comment can't be edited any more.";
const EDIT_TOO_MANY = "You've made a lot of edits in a short time. Try again in a minute.";
const EDIT_OFFLINE = "Couldn't reach Squint. Check your connection and try again.";
const EDIT_FAILED = "Couldn't save your edit. Try again in a moment.";

/**
 * A client's reply, by what the server answered. Each keeps the words in the
 * box: those that can't go through say to copy them, the others to send again.
 */
const REPLY_CLOSED =
  "Your reply wasn't sent: the review window has closed. Copy your text to keep it.";
const REPLY_RESOLVED =
  "Your reply wasn't sent: the team resolved this comment. Copy your text to keep it.";
const REPLY_DELETED =
  "Your reply wasn't sent: this comment was deleted. Copy your text to keep it.";
const REPLY_LOCKED =
  "Your reply wasn't sent: this link needs its password again. Your text is kept.";
/** No answer, or too many replies from this address: sending again later goes through. */
const REPLY_NOT_SENT_BY_STATUS: Record<number, string> = {
  0: "Your reply wasn't sent: Squint couldn't reach the server. Check your connection, then retry.",
  429: "Your reply wasn't sent: too many replies in a short time. Wait a moment, then retry.",
};
const REPLIES_FULL =
  "Your reply wasn't sent: this review is out of space for replies. Ask the project owner to make room, then retry.";

interface ClientBackendOptions {
  token: string;
  store: ClientStore;
  blobs: ServerBlobs;
}

const ownerOnly = () => ({ ok: false as const, error: OWNER_ONLY });

/**
 * The multipart post: the comment as JSON, with the browser's details but
 * not its user agent (the server records the request's), and the screenshot.
 */
function commentForm(comment: Comment, crop: ReadyCrop | null): FormData {
  const { id, x, y, body, author, snapshotId, pageId, clientInfo } = comment;
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
      ...(crop ? { crop: { rect: crop.rect } } : {}),
      ...(clientInfo ? { clientInfo: sentPart(clientInfo) } : {}),
    }),
  );
  if (crop) form.set("crop", crop.blob, `crop.${extensionFor(crop.blob.type)}`);
  return form;
}

type PostResult = ApiResult<PostedComment>;
type Refused<T> = Extract<ApiResult<T>, { ok: false }>;

/** The server refused the picture itself: sending it again won't help, so the comment goes without it. */
function cropRefused(result: PostResult): boolean {
  if (result.ok) return false;
  if (result.status === 413) return result.error !== "share-full";
  return result.status === 415 || result.error === "crop-mismatch";
}

/** No answer, a timeout or a server error: the same picture may go through on another try. */
function transient(result: PostResult): boolean {
  return !result.ok && (result.status === 0 || result.status === 408 || result.status >= 500);
}

/**
 * Sends the comment with its screenshot, up to `CROP_ATTEMPTS` times with a
 * short backoff while the failure looks temporary. Every try has the same id,
 * so one that got through answers 409 exists rather than posting twice. Null
 * when the screenshot couldn't be uploaded: the caller posts without it.
 */
async function postWithCrop(
  post: (form: FormData) => Promise<PostResult>,
  comment: Comment,
  crop: ReadyCrop,
): Promise<PostResult | null> {
  for (let attempt = 0; attempt < CROP_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await wait(cropBackoff(attempt));
    const result = await post(commentForm(comment, crop));
    if (cropRefused(result)) return null;
    if (!transient(result)) return result;
  }
  return null;
}

/**
 * The comment as this browser shows it once accepted: a client's comment
 * without its screenshot is marked so, as the server marks it on every read.
 */
function asPosted(posted: PostedComment, crop: ReadyCrop | null): ClientComment {
  const { editKey: _key, ...comment } = posted;
  return crop ? comment : { ...comment, screenshotPending: true };
}

/** The comment as the link now shows it: with its crop, or marked pending, when it says so. */
function shownAs(store: ClientStore, comment: Comment): Comment {
  const shown = store.getSnapshot().view.comments.find((entry) => entry.id === comment.id);
  if (shown?.crop) {
    return { ...comment, crop: { blobKey: `crop:${comment.id}`, rect: shown.crop.rect } };
  }
  return shown?.screenshotPending ? { ...comment, screenshotPending: true } : comment;
}

/**
 * A shared link's viewer: comments and snapshots go to the server. A comment
 * counts as posted only once the server has it; until then the composer keeps
 * the text, and sending again reuses the same id, so it can't post twice.
 */
export function createClientBackend({ token, store, blobs }: ClientBackendOptions): ViewerBackend {
  const api = clientApi(token);

  /** Reads the link again, so a comment resolved or deleted by the team shows so. */
  const refresh = async () => {
    const view = await api.view();
    if (view.ok) store.setView(view.value);
    else if (view.status === 404) store.markGone(isPaused(view));
  };

  const refused = (error: string, final: boolean): EditOutcome => ({ ok: false, error, final });

  /**
   * Why a reply wasn't sent. A comment resolved or deleted meanwhile isn't
   * read again here: the box keeps the words to copy until the next refresh
   * moves the comment on. A 404 from a link that's gone says so instead.
   */
  const replyRefusal = async (result: Refused<SharedReply>): Promise<string> => {
    if (result.status === 404) {
      const view = isPaused(result) ? result : await api.view();
      if (view.ok || view.status !== 404) return REPLY_DELETED;
      store.markGone(isPaused(view));
      return GONE;
    }
    if (isPasswordRequired(result)) {
      store.markLocked();
      return REPLY_LOCKED;
    }
    if (result.error === "review-closed") {
      store.markReviewClosed();
      return REPLY_CLOSED;
    }
    if (result.status === 409 && result.error === "locked") return REPLY_RESOLVED;
    if (result.error === "share-full") return REPLIES_FULL;
    return REPLY_NOT_SENT_BY_STATUS[result.status] ?? REPLY_NOT_SENT;
  };

  /**
   * Counts an earlier try that got through (409 exists) as sent: the link's
   * copy is read again, so the reply shows as the server stamped it.
   */
  const alreadySent = async (input: NewReply, body: string, author: string): Promise<Reply> => {
    await refresh();
    const shown = store.getSnapshot().view.replies.find((reply) => reply.id === input.id);
    const { id, commentId } = input;
    return toReply(shown ?? { id, commentId, body, author, createdAt: Date.now() });
  };

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
        ...(input.clientInfo ? { clientInfo: input.clientInfo } : {}),
      };
      // The screenshot is uploaded with the comment; once it can't be, the comment goes without it.
      const withCrop = crop ? await postWithCrop(api.addComment, comment, crop) : null;
      const sent = withCrop ? crop : null;
      const result = withCrop ?? (await api.addComment(commentForm(comment, null)));
      // 409 pending: an earlier try of this comment is still being saved (or died mid-way
      // and is reclaimable a minute later). Not delivered yet: keep the draft, try again.
      if (!result.ok && result.status === 409 && result.error === "pending") {
        return { ok: false, error: STILL_SENDING };
      }
      // 409 exists: the comment is visible, so an earlier try got through even though its
      // answer didn't arrive. Counting it as sent can't lose it or post it twice.
      if (result.ok) {
        // The key stays out of the view: it's only kept in this browser's storage.
        store.addComment(asPosted(result.value, sent), result.value.editKey);
        if (!sent) return { ok: true, value: { ...comment, screenshotPending: true } };
        blobs.hold(`crop:${comment.id}`, sent.blob);
        const cropped = { blobKey: `crop:${comment.id}`, rect: sent.rect };
        return { ok: true, value: { ...comment, crop: cropped } };
      }
      if (result.status === 409) {
        // Whichever try got through may or may not have carried the picture: the link's own
        // copy says (nothing, if it couldn't be read), and its thumbnail comes from there.
        const view = await api.view();
        if (view.ok) store.setView(view.value);
        return { ok: true, value: shownAs(store, comment) };
      }
      if (result.status === 404) {
        store.markGone(isPaused(result));
        return { ok: false, error: GONE };
      }
      if (isPasswordRequired(result)) {
        store.markLocked();
        return { ok: false, error: LOCKED };
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
    /**
     * Only with the key this browser got when posting it. A refusal for good
     * reads the link again, which the open editor outlasts (its card stays
     * until it closes), so closing it shows the comment as it now is.
     */
    async editOwnComment(id, body): Promise<EditOutcome> {
      const key = store.editKeyOf(id);
      if (!key) return refused(EDIT_GONE, true);
      const words = body.trim();
      const current = store.getSnapshot().view.comments.find((comment) => comment.id === id);
      if (current?.body === words) return { ok: true, unchanged: true };
      const result = await api.editComment(id, words, key);
      if (result.ok) {
        store.replaceComment(result.value);
        return { ok: true };
      }
      // Awaited: once the editor offers Close, the list already knows the comment left the
      // tab, so closing it moves focus on instead of to a card that then disappears.
      if (result.status === 409 && result.error === "locked") {
        await refresh();
        return refused(EDIT_LOCKED, true);
      }
      if (result.error === "review-closed") {
        store.markReviewClosed();
        return refused(EDIT_CLOSED, true);
      }
      if (result.status === 404) {
        await refresh();
        return refused(EDIT_GONE, true);
      }
      if (isPasswordRequired(result)) {
        store.markLocked();
        return refused(EDIT_FAILED, false);
      }
      if (result.status === 429) return refused(EDIT_TOO_MANY, false);
      return refused(result.status === 0 ? EDIT_OFFLINE : EDIT_FAILED, false);
    },
    deleteComment: ownerOnly,
    restoreComment: ownerOnly,
    /**
     * A guest's reply counts as sent only once the server has it; until then
     * the box keeps the words, and sending again reuses the same id, so it
     * can't post twice. Their browser's details go without the user agent,
     * which the server reads from the request. They never change or delete
     * a reply (D2).
     */
    async addReply(input): Promise<Result<Reply>> {
      const body = input.body.trim();
      const author = cleanName(input.author);
      const result = await api.addReply(input.commentId, {
        id: input.id,
        body,
        author,
        ...(input.clientInfo ? { clientInfo: sentPart(input.clientInfo) } : {}),
      });
      if (result.ok) {
        store.addReply(result.value);
        return { ok: true, value: toReply(result.value) };
      }
      if (result.status === 409 && result.error === "exists") {
        return { ok: true, value: await alreadySent(input, body, author) };
      }
      return { ok: false, error: await replyRefusal(result) };
    },
    editReply: ownerOnly,
    deleteReply: ownerOnly,
    restoreReply: ownerOnly,
    replaceWithImage: () => Promise.resolve(ownerOnly()),
    async captureSnapshot(_projectId, _url, width, signal): Promise<CaptureOutcome | null> {
      const result = await api.capture(width, signal);
      if (signal.aborted) return null;
      if (result.ok) {
        const { partial, ...shared } = result.value;
        store.addSnapshot(shared);
        return {
          ok: true,
          snapshot: { ...shared, projectId: SHARED_PROJECT_ID, blobKey: `snapshot:${shared.id}` },
          ...(partial ? { partial } : {}),
        };
      }
      if (result.status === 404) {
        store.markGone(isPaused(result));
        return { ok: false, message: GONE };
      }
      if (isPasswordRequired(result)) {
        store.markLocked();
        return { ok: false, message: CAPTURE_LOCKED };
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
      return captureFailed(code);
    },
  };
}
