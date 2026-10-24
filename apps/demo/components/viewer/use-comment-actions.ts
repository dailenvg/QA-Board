import { holdBlobs } from "@/lib/store/blob-sweep";
import type { Comment } from "@/lib/store/types";
import type { ToastInput } from "../ui/ToastProvider";
import type { ViewerBackend } from "@/lib/viewer-backend/backend";

interface CommentActionsOptions {
  backend: ViewerBackend;
  toast: (toast: ToastInput) => void;
  /** Called after a successful resolve (the mascot celebrates). */
  onResolved: () => void;
  /** Called before a comment goes away, so a selection on it can be cleared. */
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
      onRemoved(id);
      onResolved();
      toast({
        message: "Comment resolved",
        action: { label: "Undo", onAction: () => backend.setCommentStatus(id, "active") },
      });
    },
    reopen: (id: string) => {
      if (report(backend.setCommentStatus(id, "active"))) toast({ message: "Comment reopened" });
    },
    edit: (id: string, body: string) => {
      report(backend.editComment(id, body));
    },
    remove: (target: Comment) => {
      onRemoved(target.id);
      // Its screenshot stays while Undo is offered, however long the toast is held open.
      const release = holdBlobs(target.crop ? [target.crop.blobKey] : []);
      if (!report(backend.deleteComment(target.id))) {
        release();
        return;
      }
      toast({
        message: "Comment deleted",
        action: {
          label: "Undo",
          onAction: () => {
            report(backend.restoreComment(target));
            release();
          },
        },
        onDismiss: release,
      });
    },
  };
}
