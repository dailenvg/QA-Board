import { describe, expect, it, vi } from "vitest";
import type { Result } from "@/lib/store/store";
import type { Comment, Reply } from "@/lib/store/types";
import type { ViewerBackend } from "@/lib/viewer-backend/backend";
import { HAS_CLIENT_REPLIES } from "@/lib/workspace-client/mutations";
import type { ToastInput } from "../ui/ToastProvider";
import { teamOnlyChanges } from "./use-team-only-change";

const comment = (id: string, teamOnly = false): Comment => ({
  id,
  projectId: "p-1",
  x: 1,
  y: 1,
  body: "Hi",
  author: "Ana",
  status: "active",
  createdAt: 1_000,
  updatedAt: 1_000,
  mine: true,
  ...(teamOnly ? { teamOnly: true as const } : {}),
});
const REPLY: Reply = {
  id: "r-1",
  projectId: "p-1",
  commentId: "c-2",
  body: "Yes",
  author: "Ana",
  createdAt: 2_000,
  mine: true,
};
const LIST = [comment("c-1"), comment("c-2"), comment("c-3"), comment("c-4", true)];

const settled = () => new Promise((done) => setTimeout(done, 0));

/**
 * The changes over a store holding `LIST` that applies each change at once (as the workspace's
 * does) and a backend answering `result`, rolled back when it refuses; the toasts they raise.
 */
function setup(result: Result = { ok: true, value: undefined }, replies: readonly Reply[] = []) {
  let list: Comment[] = [...LIST];
  const flip = (id: string, teamOnly: boolean) => {
    list = list.map((entry) => {
      if (entry.id !== id) return entry;
      const { teamOnly: _previous, ...rest } = entry;
      return teamOnly ? { ...rest, teamOnly: true as const } : rest;
    });
  };
  const setCommentTeamOnly = vi.fn((id: string, teamOnly: boolean) => {
    flip(id, teamOnly);
    if (!result.ok) flip(id, !teamOnly);
    return Promise.resolve(result);
  });
  const setReplyTeamOnly = vi.fn(() => Promise.resolve(result));
  const backend = { setCommentTeamOnly, setReplyTeamOnly } as unknown as ViewerBackend;
  const toasts: ToastInput[] = [];
  const changes = teamOnlyChanges({
    backend,
    toast: (toast) => toasts.push(toast),
    repliesOf: () => replies,
    commentsNow: () => list,
  });
  return { changes, toasts, setCommentTeamOnly, setReplyTeamOnly };
}

describe("teamOnlyChanges", () => {
  it("names both numbers and offers Undo, which shows it again (W9)", async () => {
    const { changes, toasts, setCommentTeamOnly } = setup();
    changes.changeComment("c-2", true);
    expect(setCommentTeamOnly).toHaveBeenCalledWith("c-2", true);
    // c-2 comes before c-4, the team's T1, so it takes T1 and c-4 moves to T2 (R7).
    expect(toasts[0]?.message).toBe("Comment 2 is now T1, team only");
    toasts[0]?.action?.onAction();
    expect(setCommentTeamOnly).toHaveBeenLastCalledWith("c-2", false);
    expect(toasts[1]?.message).toBe("T1 is now comment 2, shown to your client");
    await settled();
    expect(toasts).toHaveLength(2);
  });

  it("never sends a comment a client's pulled reply is under, and says why without Retry", () => {
    const client: Reply = { ...REPLY, mine: undefined, fromClient: true };
    const { changes, toasts, setCommentTeamOnly } = setup(undefined, [client]);
    changes.changeComment("c-1", true);
    expect(setCommentTeamOnly).not.toHaveBeenCalled();
    expect(toasts).toEqual([{ tone: "error", message: HAS_CLIENT_REPLIES }]);
  });

  it("rolls a server's 409 back with the same words, and anything else with Retry", async () => {
    const refused = setup({ ok: false, error: HAS_CLIENT_REPLIES });
    refused.changes.changeComment("c-1", true);
    await settled();
    expect(refused.toasts.at(-1)).toEqual({ tone: "error", message: HAS_CLIENT_REPLIES });

    const failed = setup({ ok: false, error: "That change didn't save." });
    failed.changes.changeReply(REPLY, true);
    await settled();
    const error = failed.toasts.at(-1);
    expect(error).toMatchObject({ tone: "error", message: "Couldn't change who sees this." });
    error?.action?.onAction();
    expect(failed.setReplyTeamOnly).toHaveBeenCalledTimes(2);
  });

  it("names the numbers as they are when Undo is pressed, not when the change was made (R7)", () => {
    const { changes, toasts } = setup();
    changes.changeComment("c-2", true);
    expect(toasts[0]?.message).toBe("Comment 2 is now T1, team only");
    // Comment 1 goes team only meanwhile: c-2 is now T2, and would show as comment 1.
    changes.changeComment("c-1", true);
    toasts[0]?.action?.onAction();
    expect(toasts.at(-1)?.message).toBe("T2 is now comment 1, shown to your client");
  });

  it("says a reply's change, with Undo", () => {
    const { changes, toasts, setReplyTeamOnly } = setup();
    changes.changeReply(REPLY, true);
    expect(toasts[0]?.message).toBe("Reply is team only");
    toasts[0]?.action?.onAction();
    expect(setReplyTeamOnly).toHaveBeenLastCalledWith("r-1", false);
    expect(toasts[1]?.message).toBe("Reply is shown to your client");
  });
});
