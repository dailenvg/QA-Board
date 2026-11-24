import type { Reply } from "@/lib/store/types";
import type { ViewerBackend } from "@/lib/viewer-backend/backend";
import type { ToastInput } from "../ui/ToastProvider";

interface ReplyActionsOptions {
  backend: ViewerBackend;
  toast: (toast: ToastInput) => void;
}

/** Editing and deleting the member's own replies, each with its toast and Undo where it has one. */
export function useReplyActions({ backend, toast }: ReplyActionsOptions) {
  const report = (result: { ok: boolean; error?: string }) => {
    if (!result.ok) toast({ tone: "error", message: result.error ?? "That didn't work." });
    return result.ok;
  };

  return {
    /** New words show at once; a refusal puts the old ones back, with a toast. */
    edit: (reply: Reply, body: string) => void report(backend.editReply(reply.id, body)),
    /**
     * Deletes the member's own reply at once, with Undo, which posts it back
     * with its times. `afterRemoval` moves focus on from it.
     */
    remove: (reply: Reply, afterRemoval: () => void) => {
      if (!report(backend.deleteReply(reply.id))) return;
      afterRemoval();
      toast({
        message: "Reply deleted",
        action: { label: "Undo", onAction: () => void report(backend.restoreReply(reply)) },
      });
    },
  };
}
