import { describe, expect, it, vi } from "vitest";
import type { Comment, Reply } from "@/lib/store/types";
import type { ViewerBackend } from "@/lib/viewer-backend/backend";
import type { ToastInput } from "../ui/ToastProvider";
import { useCommentActions } from "./use-comment-actions";

const COMMENT: Comment = {
  id: "c-1",
  projectId: "p-1",
  x: 10,
  y: 20,
  body: "Tighten the hero.",
  author: "Ana",
  status: "active",
  createdAt: 1_000,
  updatedAt: 1_000,
  mine: true,
};
const reply = (id: string, mine: boolean): Reply => ({
  id,
  projectId: "p-1",
  commentId: "c-1",
  body: "On it.",
  author: mine ? "Ana" : "Ben",
  createdAt: 2_000,
  ...(mine ? { mine: true as const } : {}),
});

/**
 * The actions over a backend that takes every change, and the toasts they raise. The hook holds
 * no state (it calls no other hook), so a test can call it directly.
 */
function useActions() {
  const deleteComment = vi.fn(() => ({ ok: true }));
  const restoreComment = vi.fn(() => ({ ok: true }));
  const backend = { deleteComment, restoreComment } as unknown as ViewerBackend;
  const toasts: ToastInput[] = [];
  const actions = useCommentActions({
    backend,
    toast: (toast) => toasts.push(toast),
    onResolved: () => {},
    onRemoved: () => {},
  });
  return { deleteComment, restoreComment, toasts, actions };
}

describe("deleting a comment (D25)", () => {
  it("offers Undo, which brings back the comment and the member's own replies", () => {
    const { deleteComment, restoreComment, toasts, actions } = useActions();
    const own = [reply("r-1", true), reply("r-2", true)];
    actions.remove(COMMENT, own);
    expect(deleteComment).toHaveBeenCalledWith("c-1");
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.message).toBe("Comment deleted");
    toasts[0]?.action?.onAction();
    expect(restoreComment).toHaveBeenCalledWith(COMMENT, own);
  });

  it("offers Undo without replies too", () => {
    const { restoreComment, toasts, actions } = useActions();
    actions.remove(COMMENT);
    toasts[0]?.action?.onAction();
    expect(restoreComment).toHaveBeenCalledWith(COMMENT, []);
  });

  it("offers no Undo once someone else's reply is among them, which Undo couldn't post back", () => {
    const { deleteComment, restoreComment, toasts, actions } = useActions();
    actions.remove(COMMENT, [reply("r-1", true), reply("r-2", false)]);
    expect(restoreComment).not.toHaveBeenCalled();
    expect(deleteComment).toHaveBeenCalledWith("c-1");
    expect(toasts).toEqual([
      { message: "Comment deleted. Someone replied just before, so it can't be undone." },
    ]);
  });
});
