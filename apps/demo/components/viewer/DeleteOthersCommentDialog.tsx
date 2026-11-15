"use client";

import { useState } from "react";
import { deleteOthersComment, type ModeratedDelete } from "@/lib/store/actions";
import type { Comment } from "@/lib/store/types";
import { ownerLabel } from "@/lib/workspace-client/permission-copy";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import type { ToastInput } from "../ui/ToastProvider";

interface DeleteOthersCommentDialogProps {
  open: boolean;
  /** Someone else's team comment (`commentRights` says `confirm`); kept while the dialog fades. */
  comment: Comment | null;
  /** The workspace owner's name, for a refusal; null until they give one. */
  ownerName: string | null;
  onClose: () => void;
  /** The server deleted it (or it was already gone): the caller moves focus on from its card. */
  onDeleted: (comment: Comment) => void;
  toast: (toast: ToastInput) => void;
}

const DELETING = "Deleting…";

/** What the dialog says when a delete didn't go through; null when it closes instead. */
function failure(outcome: ModeratedDelete, ownerName: string | null): string | null {
  switch (outcome) {
    case "owner-only":
      return `Only ${ownerLabel(ownerName)} can delete other people's comments.`;
    case "offline":
      return "Couldn't delete the comment. Check your connection and try again.";
    case "failed":
      return "Couldn't delete the comment. Something went wrong on our side, so try again in a moment.";
    default:
      return null;
  }
}

/**
 * The comment's first line with words in it, so the owner can see which one
 * they're deleting (a body opening on a blank line would quote nothing).
 */
function firstLine(body: string): string {
  return body.split("\n").find((line) => line.trim() !== "") ?? body;
}

/**
 * The owner deleting someone else's comment. Nothing can bring it back as
 * theirs, so there's no Undo: this asks first, then waits for the server
 * ("Deleting…", the dialog staying up), and the comment leaves the list only
 * once it's gone there. A failure stays in the dialog, and confirming tries
 * again.
 */
export function DeleteOthersCommentDialog({
  open,
  comment,
  ownerName,
  onClose,
  onDeleted,
  toast,
}: DeleteOthersCommentDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const author = comment?.author ?? "";

  const close = () => {
    setError(null);
    onClose();
  };

  const confirm = async () => {
    if (!comment) return;
    setPending(true);
    setError(null);
    const outcome = await deleteOthersComment(comment);
    setPending(false);
    const refused = failure(outcome, ownerName);
    if (refused) {
      setError(refused);
      return;
    }
    close();
    onDeleted(comment);
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
      title={`Delete ${author}'s comment?`}
      description={
        <>
          <q className="line-clamp-2 break-words text-ink-2">{firstLine(comment?.body ?? "")}</q>
          <span className="mt-2 block">
            It&apos;s deleted for everyone, {author} included. This can&apos;t be undone.
          </span>
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
