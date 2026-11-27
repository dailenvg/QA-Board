import { pinNumbers } from "@/lib/store/pin-numbers";
import type { Comment, Reply } from "@/lib/store/types";
import { useDialogState } from "@/lib/use-dialog-state";
import type { ViewerBackend } from "@/lib/viewer-backend/backend";
import { HAS_CLIENT_REPLIES } from "@/lib/workspace-client/mutations";
import type { ToastInput } from "../ui/ToastProvider";
import { TEAM_ONLY_COPY as COPY } from "./team-only-copy";

/** What a team-only change asks before it goes (D11, D12). */
export type TeamOnlyAsk =
  | { kind: "hide-comment"; comment: Comment }
  | { kind: "show-comment"; comment: Comment }
  | { kind: "show-reply"; reply: Reply };

interface TeamOnlyChangeOptions {
  backend: ViewerBackend;
  toast: (toast: ToastInput) => void;
  /** The project's comments in pin order (`commentsFor`), to name the numbers before and after. */
  comments: readonly Comment[];
  /** A comment's replies, oldest first. */
  repliesOf: (commentId: string) => readonly Reply[];
  /** The project has a review link: hiding a comment asks first, as clients may have seen it. */
  linked: boolean;
}

/** `comment` kept to the team or shown, as the store will have it. */
function withFlag(comment: Comment, teamOnly: boolean): Comment {
  const { teamOnly: _previous, ...rest } = comment;
  return teamOnly ? { ...rest, teamOnly: true } : rest;
}

/** `comments` with `id` kept to the team or shown. */
const flipped = (comments: readonly Comment[], id: string, teamOnly: boolean): Comment[] =>
  comments.map((comment) => (comment.id === id ? withFlag(comment, teamOnly) : comment));

type TeamOnlyChangesOptions = Pick<TeamOnlyChangeOptions, "backend" | "toast" | "repliesOf">;

/**
 * The changes themselves, without asking: at once, then a toast naming the new number with Undo
 * (R7, W9). A comment a client's pulled reply is under is never made team only (D10): the error
 * toast says why, without Retry, as a server refusal (409) does after it's rolled back. Any other
 * failure is rolled back with Retry. The toast region is the live region: nothing else speaks.
 */
export function teamOnlyChanges({ backend, toast, repliesOf }: TeamOnlyChangesOptions) {
  /** True (and says why) when a client's reply is under `comment`, so it can't be team only. */
  const refuseForClientReply = (comment: Comment) => {
    if (!repliesOf(comment.id).some((reply) => reply.fromClient)) return false;
    toast({ tone: "error", message: HAS_CLIENT_REPLIES });
    return true;
  };

  /** The refusal as it came back: the 409's reason has no Retry, since it can't work. */
  const failed = (error: string, retry: () => void) =>
    toast(
      error === HAS_CLIENT_REPLIES
        ? { tone: "error", message: error }
        : {
            tone: "error",
            message: COPY.toast.failed,
            action: { label: COPY.toast.retry, onAction: retry },
          },
    );

  /**
   * Changes `comment` (as it is in `list`, the comments in pin order) and names the numbers
   * before and after. `retried`: a Retry, whose toast has gone, so the change announces itself
   * once it's saved.
   */
  function changeComment(
    comment: Comment,
    teamOnly: boolean,
    list: readonly Comment[],
    retried = false,
  ) {
    if (teamOnly && refuseForClientReply(comment)) return;
    const after = flipped(list, comment.id, teamOnly);
    const before = pinNumbers(list).get(comment.id)?.label ?? "";
    const now = pinNumbers(after).get(comment.id)?.label ?? "";
    const announce = () =>
      toast({
        message: teamOnly
          ? COPY.toast.commentHidden(before, now)
          : COPY.toast.commentShown(before, now),
        action: {
          label: COPY.toast.undo,
          onAction: () => changeComment(withFlag(comment, teamOnly), !teamOnly, after),
        },
      });
    void backend.setCommentTeamOnly(comment.id, teamOnly).then((result) => {
      if (result.ok) {
        if (retried) announce();
        return;
      }
      failed(result.error, () => changeComment(comment, teamOnly, list, true));
    });
    if (!retried) announce();
  }

  /** Changes `reply`, as `changeComment` does, with its own toast and Undo. */
  function changeReply(reply: Reply, teamOnly: boolean, retried = false) {
    const announce = () =>
      toast({
        message: teamOnly ? COPY.toast.replyHidden : COPY.toast.replyShown,
        action: { label: COPY.toast.undo, onAction: () => changeReply(reply, !teamOnly) },
      });
    void backend.setReplyTeamOnly(reply.id, teamOnly).then((result) => {
      if (result.ok) {
        if (retried) announce();
        return;
      }
      failed(result.error, () => changeReply(reply, teamOnly, true));
    });
    if (!retried) announce();
  }

  return { refuseForClientReply, changeComment, changeReply };
}

/**
 * Making comments and replies team only, and showing them to the client again (057), from a More
 * menu: showing always asks first (D12); hiding a comment asks only while the project has a
 * review link (D11), as clients may have seen it; hiding a reply asks nothing. The changes are
 * `teamOnlyChanges`'.
 */
export function useTeamOnlyChange({ comments, linked, ...options }: TeamOnlyChangeOptions) {
  const asking = useDialogState<TeamOnlyAsk>();
  const changes = teamOnlyChanges(options);

  return {
    asking,
    /** From a comment's More menu: asks first where D11 and D12 say so. */
    setComment: (comment: Comment, teamOnly: boolean) => {
      if (teamOnly && changes.refuseForClientReply(comment)) return;
      if (!teamOnly) asking.show({ kind: "show-comment", comment });
      else if (linked) asking.show({ kind: "hide-comment", comment });
      else changes.changeComment(comment, true, comments);
    },
    /** From a reply's More menu: showing it asks first, hiding it doesn't. */
    setReply: (reply: Reply, teamOnly: boolean) => {
      if (teamOnly) changes.changeReply(reply, true);
      else asking.show({ kind: "show-reply", reply });
    },
    /** The confirm's button: makes the change it asked about. */
    confirm: () => {
      const ask = asking.payload;
      asking.close();
      if (!ask) return;
      if (ask.kind === "show-reply") changes.changeReply(ask.reply, false);
      else changes.changeComment(ask.comment, ask.kind === "hide-comment", comments);
    },
  };
}
