import type { Comment } from "@/lib/store/types";
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

/** Resolve, reopen, edit and delete, each with its toast and Undo where it has one. */
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
    remove: (target: Comment) => {
      onRemoved(target.id);
      // Its screenshot stays stored, so Undo brings the comment back whole.
      if (!report(backend.deleteComment(target.id))) return;
      toast({
        message: "Comment deleted",
        action: { label: "Undo", onAction: () => void report(backend.restoreComment(target)) },
      });
    },
  };
}
