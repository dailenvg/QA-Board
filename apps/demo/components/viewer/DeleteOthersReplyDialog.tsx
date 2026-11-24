"use client";

import { deleteOthersReply } from "@/lib/store/actions";
import type { Reply } from "@/lib/store/types";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import type { ToastInput } from "../ui/ToastProvider";
import { firstLine } from "./first-line";
import { useModeratedDelete } from "./use-moderated-delete";

interface DeleteOthersReplyDialogProps {
  open: boolean;
  /** Someone else's reply (`replyRights` says `confirm`); kept while the dialog fades. */
  reply: Reply | null;
  /** The workspace owner's name, for a refusal; null until they give one. */
  ownerName: string | null;
  onClose: () => void;
  /** The server deleted it (or it was already gone): the thread moves focus on. */
  onDeleted: () => void;
  toast: (toast: ToastInput) => void;
}

/**
 * The owner deleting someone else's reply. Nothing can bring it back as
 * theirs, so there's no Undo: this asks first, then waits for the server, and
 * the reply leaves its thread only once it's gone there. A failure stays in
 * the dialog, and confirming tries again.
 */
export function DeleteOthersReplyDialog({
  open,
  reply,
  ownerName,
  onClose,
  onDeleted,
  toast,
}: DeleteOthersReplyDialogProps) {
  const { pending, error, clearError, run } = useModeratedDelete("reply", ownerName);

  const close = () => {
    clearError();
    onClose();
  };

  const confirm = async () => {
    if (!reply) return;
    const outcome = await run(() => deleteOthersReply(reply));
    if (!outcome) return;
    close();
    onDeleted();
    toast(
      outcome === "gone"
        ? { message: "That reply was already deleted. The thread is up to date now." }
        : { message: "Reply deleted." },
    );
  };

  return (
    <ConfirmDialog
      open={open}
      onClose={close}
      title={reply ? `Delete ${reply.author}'s reply?` : "Delete reply?"}
      description={
        <>
          <q className="line-clamp-2 break-words text-ink-2">{firstLine(reply?.body ?? "")}</q>
          <span className="mt-2 block">
            It will be removed for everyone. This can&apos;t be undone.
          </span>
        </>
      }
      confirmLabel="Delete reply"
      pending={pending}
      pendingLabel="Deleting…"
      error={error}
      onConfirm={() => void confirm()}
    />
  );
}
