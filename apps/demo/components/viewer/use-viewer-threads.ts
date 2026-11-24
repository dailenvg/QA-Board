import { useMemo, useState } from "react";
import { captureClientInfo } from "@/lib/client-info/capture";
import { threadsOf } from "@/lib/store/replies";
import type { Comment, Reply, SquintData } from "@/lib/store/types";
import { useDialogState } from "@/lib/use-dialog-state";
import type { ViewerBackend } from "@/lib/viewer-backend/backend";
import type { ToastInput } from "../ui/ToastProvider";
import type { CommentViewer } from "./comment-rights";
import type { CommentThreads, ReplyDraft } from "./comment-threads";
import { createReplyDrafts, sendReplyDraft } from "./reply-drafts";
import { replyRights } from "./reply-rights";
import { useReplyActions } from "./use-reply-actions";

const NO_REPLIES: readonly Reply[] = [];

interface ViewerThreadsOptions {
  data: SquintData;
  projectId: string;
  backend: ViewerBackend;
  viewer: CommentViewer;
  toast: (toast: ToastInput) => void;
  /** Opens a reply's browser details (Get info). */
  onGetInfo: (reply: Reply) => void;
}

/** Someone else's reply the owner is deleting, and where focus goes once it's gone. */
export interface ModeratedReply {
  reply: Reply;
  afterRemoval: () => void;
}

/**
 * The viewer's threads (U1): the project's replies by comment (`byComment`),
 * and what the cards and the pin's popover read through `CommentThreadsContext`. Null
 * `value` on a review link, whose guests don't read replies yet. `moderating`
 * is the owner's confirm for deleting someone else's reply.
 */
export function useViewerThreads({
  data,
  projectId,
  backend,
  viewer,
  toast,
  onGetInfo,
}: ViewerThreadsOptions) {
  const threads = useMemo(() => threadsOf(data.replies, projectId), [data.replies, projectId]);
  const actions = useReplyActions({ backend, toast });
  const moderating = useDialogState<ModeratedReply>();
  // Unsent words outlive the box they were typed in (a card's, the popover's).
  const [drafts] = useState(createReplyDrafts);

  /**
   * Posts with the browser as it is when Reply is pressed, as a new comment does. The words
   * leave the comment's draft while they're sent (`sendReplyDraft`).
   */
  const send = (comment: Comment, draft: ReplyDraft) =>
    sendReplyDraft(drafts, comment.id, draft.body, async () => {
      if (draft.author.trim() !== data.authorName) backend.setAuthorName(draft.author);
      const clientInfo = await captureClientInfo();
      return backend.addReply({
        id: draft.id,
        projectId: comment.projectId,
        commentId: comment.id,
        body: draft.body,
        author: draft.author,
        ...(clientInfo ? { clientInfo } : {}),
      });
    });

  const value: CommentThreads | null = viewer.team
    ? {
        repliesOf: (commentId) => threads.get(commentId) ?? NO_REPLIES,
        viewer,
        authorName: data.authorName,
        ...drafts,
        send,
        edit: actions.edit,
        remove: (reply, afterRemoval) => {
          if (replyRights(reply, viewer).delete === "confirm") {
            moderating.show({ reply, afterRemoval });
          } else actions.remove(reply, afterRemoval);
        },
        getInfo: onGetInfo,
      }
    : null;

  return { byComment: threads, value, moderating };
}
