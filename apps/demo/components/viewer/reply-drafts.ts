import type { Result } from "@/lib/store/store";

/** Words typed in reply boxes and not sent yet, by comment id, kept in memory only. */
export interface ReplyDrafts {
  /** The comment's unsent reply; empty without one. */
  draftOf: (commentId: string) => string;
  /** Keeps the words as typed; empty ones (cleared, or sent) drop the draft. */
  keepDraft: (commentId: string, body: string) => void;
}

/**
 * A comment's reply box lives in its card or in its pin's popover, whichever
 * shows the thread, and a box that unmounts takes its state with it. The
 * draft outlives both, so words typed in the card are still there in the
 * popover, and back. Never stored: a reload starts empty.
 */
export function createReplyDrafts(): ReplyDrafts {
  const drafts = new Map<string, string>();
  return {
    draftOf: (commentId) => drafts.get(commentId) ?? "",
    keepDraft: (commentId, body) => {
      if (body) drafts.set(commentId, body);
      else drafts.delete(commentId);
    },
  };
}

/**
 * Sends a comment's reply through `post`, its words leaving the draft as the
 * send starts: a box that mounts meanwhile (the thread moved between the card
 * and the popover) starts empty, so it can't post the same words again under
 * a new id. A refusal puts them back, unless something new was typed since.
 */
export async function sendReplyDraft<T>(
  drafts: ReplyDrafts,
  commentId: string,
  body: string,
  post: () => Promise<Result<T>>,
): Promise<Result<T>> {
  drafts.keepDraft(commentId, "");
  const result = await post();
  if (!result.ok && !drafts.draftOf(commentId)) drafts.keepDraft(commentId, body);
  return result;
}
