"use client";

import { deleteOthersComment } from "@/lib/store/actions";
import type { Comment } from "@/lib/store/types";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import type { ToastInput } from "../ui/ToastProvider";
import { firstLine } from "./first-line";
import { useModeratedDelete } from "./use-moderated-delete";

/**
 * A comment deleted without Undo: someone else's (`others`, the owner
 * moderating, as `commentRights` says), or one anyone else replied to
 * (`replied`, D25), its own or a client's, since Undo can't post others'
 * replies back as theirs.
 */
export interface ForGoodComment {
  comment: Comment;
  reason: "others" | "replied";
  /** Its pin number. */
  number: number;
  /** How many replies go with it. */
  replyCount: number;
}

interface DeleteOthersCommentDialogProps {
  open: boolean;
  /** Kept while the dialog fades. */
  target: ForGoodComment | null;
  /** The workspace owner's name, for a refusal; null until they give one. */
  ownerName: string | null;
  onClose: () => void;
  /** The server deleted it (or it was already gone): the caller moves focus on from its card. */
  onDeleted: (comment: Comment) => void;
  toast: (toast: ToastInput) => void;
}

const DELETING = "Deleting…";

/** "its reply", "its 3 replies". */
const itsReplies = (count: number) => (count === 1 ? "its reply" : `its ${count} replies`);

/** The dialog's title and what it says under it, by why there's no Undo. */
function copy({ comment, reason, number, replyCount }: ForGoodComment) {
  if (reason === "replied") {
    return {
      title: `Delete comment ${number} and ${replyCount === 1 ? "its reply" : "its replies"}?`,
      line: `The comment, its pin and ${itsReplies(replyCount)} will be removed for everyone. This can't be undone.`,
    };
  }
  return {
    title: `Delete ${comment.author}'s comment?`,
    line: `It's deleted for everyone, ${comment.author} included. This can't be undone.`,
  };
}

/**
 * Deleting a comment that nothing can bring back as it was: someone else's
 * (the owner), or one others replied to (D25). There's no Undo, so this asks
 * first, then waits for the server ("Deleting…", the dialog staying up), and
 * the comment (with its replies) leaves the list only once it's gone there.
 * A failure stays in the dialog, and confirming tries again.
 */
export function DeleteOthersCommentDialog({
  open,
  target,
  ownerName,
  onClose,
  onDeleted,
  toast,
}: DeleteOthersCommentDialogProps) {
  const { pending, error, clearError, run } = useModeratedDelete("comment", ownerName);
  const words = target ? copy(target) : { title: "Delete comment?", line: "" };

  const close = () => {
    clearError();
    onClose();
  };

  const confirm = async () => {
    if (!target) return;
    const outcome = await run(() => deleteOthersComment(target.comment));
    if (!outcome) return;
    close();
    onDeleted(target.comment);
    toast(
      outcome === "gone"
        ? { message: "That comment was already deleted. The list is up to date now." }
        : { message: "Comment deleted." },
    );
  };

  return (
    <ConfirmDialog
      open={open}
      onClose={close}
      title={words.title}
      description={
        <>
          <q className="line-clamp-2 break-words text-ink-2">
            {firstLine(target?.comment.body ?? "")}
          </q>
          <span className="mt-2 block">{words.line}</span>
        </>
      }
      confirmLabel="Delete comment"
      pending={pending}
      pendingLabel={DELETING}
      error={error}
      onConfirm={() => void confirm()}
    />
  );
}
