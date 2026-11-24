import { createContext, use } from "react";
import type { Result } from "@/lib/store/store";
import type { Comment, Reply } from "@/lib/store/types";
import type { CommentViewer } from "./comment-rights";

/** What a thread is sent: the new reply's id (kept across retries), its words and its author. */
export interface ReplyDraft {
  id: string;
  body: string;
  author: string;
}

/**
 * The viewer's threads (U1): each comment's replies, who's reading them, and
 * what they can do. Cards and the pin's popover read it; without it (a review
 * link, until guests read replies) neither shows a thread.
 */
export interface CommentThreads {
  /** A comment's replies, oldest first. */
  repliesOf: (commentId: string) => readonly Reply[];
  viewer: CommentViewer;
  /** The member's name for new replies; null until they give one. */
  authorName: string | null;
  /** Resolves once the reply is saved or refused, never rejecting; on a refusal the box keeps it. */
  send: (comment: Comment, draft: ReplyDraft) => Promise<Result<Reply>>;
  /** New words for the member's own reply. */
  edit: (reply: Reply, body: string) => void;
  /**
   * Deletes a reply: their own at once, with Undo; anyone else's (the owner)
   * after a confirm. `afterRemoval` runs once it has left, to move focus on.
   */
  remove: (reply: Reply, afterRemoval: () => void) => void;
  /** Opens the reply's browser details (the team's "Get info"). */
  getInfo: (reply: Reply) => void;
}

export const CommentThreadsContext = createContext<CommentThreads | null>(null);

/** The viewer's threads, or null where there are none to show. */
export function useCommentThreads(): CommentThreads | null {
  return use(CommentThreadsContext);
}
