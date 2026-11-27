import { createContext, use } from "react";
import type { Result } from "@/lib/store/store";
import type { Comment, Reply } from "@/lib/store/types";
import type { CommentViewer } from "./comment-rights";
import type { ReplyDrafts } from "./reply-drafts";
import { canReply } from "./reply-rights";

/** What a thread is sent: the new reply's id (kept across retries), its words and its author. */
export interface ReplyDraft {
  id: string;
  body: string;
  author: string;
  /** The team's reply box: kept to the team (057). */
  teamOnly?: boolean;
}

/**
 * Whether the team's reply box under a comment offers "Team only" (057): `choose` under a comment
 * clients see; `kept` under a team-only one, whose replies are all the team's anyway. A guest's
 * box has neither.
 */
export type ReplyVisibility = "choose" | "kept" | undefined;

/**
 * The viewer's threads (U1): each comment's replies, who's reading them, and
 * what they can do (a review link's guest replies, and changes no reply).
 * Cards and the pin's popover read it; without it neither shows a thread.
 */
export interface CommentThreads extends ReplyDrafts {
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
  /** Makes a reply team only, or shows it to the client (asking first, `useTeamOnlyChange`). */
  setTeamOnly: (reply: Reply, teamOnly: boolean) => void;
  /**
   * The comment's reply box stays though its viewer may no longer reply there
   * (a guest whose window closed, or whose comment the team resolved): words
   * are in it or on their way, so they stay to copy, with why they weren't sent.
   */
  keepsBox: (commentId: string) => boolean;
}

export const CommentThreadsContext = createContext<CommentThreads | null>(null);

/** Whether the comment's reply box shows: where its viewer may reply, or where words are kept. */
export function showsReplyBox(threads: CommentThreads, comment: Comment): boolean {
  return canReply(threads.viewer, comment) || threads.keepsBox(comment.id);
}

/** `ReplyVisibility` for `comment`'s box. */
export function replyVisibility(threads: CommentThreads, comment: Comment): ReplyVisibility {
  if (!threads.viewer.team) return undefined;
  return comment.teamOnly ? "kept" : "choose";
}

/** The viewer's threads, or null where there are none to show. */
export function useCommentThreads(): CommentThreads | null {
  return use(CommentThreadsContext);
}
