import { commentDeleteMode } from "@/lib/store/replies";
import type { Comment, CommentPriority, Reply } from "@/lib/store/types";
import type { ToastInput } from "../ui/ToastProvider";
import type { EditOutcome, ViewerBackend } from "@/lib/viewer-backend/backend";

interface CommentActionsOptions {
  backend: ViewerBackend;
  toast: (toast: ToastInput) => void;
  /** Called after a successful resolve (the mascot celebrates, and a selection on it is cleared). */
  onResolved: (id: string) => void;
  /** Called before a comment is deleted, so a selection or open popover on it can be cleared. */
  onRemoved: (id: string) => void;
}

/**
 * Resolve, reopen, edit, delete and set the priority of a comment, each with its toast and
 * Undo where it has one.
 */
export function useCommentActions({
  backend,
  toast,
  onResolved,
  onRemoved,
}: CommentActionsOptions) {
  const report = (result: { ok: boolean; error?: string }) => {
    if (!result.ok) toast({ tone: "error", message: result.error ?? "That didn't work." });
    return result.ok;
  };

  return {
    resolve: (id: string) => {
      if (!report(backend.setCommentStatus(id, "resolved"))) return;
      onResolved(id);
      toast({
        message: "Comment resolved",
        action: { label: "Undo", onAction: () => backend.setCommentStatus(id, "active") },
      });
    },
    reopen: (id: string) => {
      if (report(backend.setCommentStatus(id, "active"))) toast({ message: "Comment reopened" });
    },
    /** The team's: sets or clears (null) the priority, shown at once by the chip; false if refused. */
    setPriority: (id: string, priority: CommentPriority | null): boolean =>
      report(backend.setCommentPriority(id, priority)),
    /**
     * The team's edit shows at once (a refusal is a toast); a guest's waits
     * for the server, and its editor shows a refusal (`EditOutcome`).
     */
    edit: (id: string, body: string): Promise<EditOutcome> | void => {
      if (!backend.editOwnComment) {
        report(backend.editComment(id, body));
        return;
      }
      return backend.editOwnComment(id, body).then((outcome) => {
        // Same words: the editor just closes, since nothing was updated.
        if (outcome.ok && !outcome.unchanged) toast({ message: "Comment updated." });
        return outcome;
      });
    },
    /**
     * Deletes at once with Undo, which puts back `replies` too (the thread as
     * it was, oldest first) while they're all the member's own (D25). Once
     * anyone else's is among them, Undo couldn't post theirs back, so there's
     * none: such a delete goes through `DeleteOthersCommentDialog` instead, and
     * this only gets one when someone replied after its confirm opened.
     */
    remove: (target: Comment, replies: readonly Reply[] = []) => {
      onRemoved(target.id);
      // Its screenshot stays stored, so Undo brings the comment back whole.
      if (!report(backend.deleteComment(target.id))) return;
      if (commentDeleteMode(replies) !== "undo") {
        toast({ message: "Comment deleted. Someone replied just before, so it can't be undone." });
        return;
      }
      const thread = [...replies];
      toast({
        message: "Comment deleted",
        action: {
          label: "Undo",
          onAction: () => void report(backend.restoreComment(target, thread)),
        },
      });
    },
  };
}
