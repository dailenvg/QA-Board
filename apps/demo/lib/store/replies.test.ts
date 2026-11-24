import { describe, expect, it } from "vitest";
import { commentDeleteMode, repliesFor, replyDeleteMode } from "./replies";
import type { Reply, SquintData } from "./types";

const reply = (id: string, extra: Partial<Reply> = {}): Reply => ({
  id,
  projectId: "p1",
  commentId: "c1",
  body: "On it",
  author: "Ana",
  createdAt: 1,
  ...extra,
});

describe("repliesFor", () => {
  it("gives a comment's replies oldest first, never another project's", () => {
    const data = {
      replies: [
        reply("late", { createdAt: 9 }),
        reply("early", { createdAt: 2 }),
        reply("other-comment", { commentId: "c2" }),
        reply("other-project", { projectId: "p2" }),
      ],
    } as SquintData;
    expect(repliesFor(data, { id: "c1", projectId: "p1" }).map((entry) => entry.id)).toEqual([
      "early",
      "late",
    ]);
  });
});

describe("how a delete goes (D25)", () => {
  it("undoes a comment's delete while every reply is the member's own, or there's none", () => {
    expect(commentDeleteMode([])).toBe("undo");
    expect(commentDeleteMode([reply("a", { mine: true }), reply("b", { mine: true })])).toBe(
      "undo",
    );
  });

  it("asks first, with no Undo, once anyone else replied, a client included", () => {
    expect(commentDeleteMode([reply("a", { mine: true }), reply("b")])).toBe("confirm");
    expect(commentDeleteMode([reply("a", { fromClient: true })])).toBe("confirm");
  });

  it("undoes the delete of one's own reply, and asks first for anyone else's", () => {
    expect(replyDeleteMode({ mine: true })).toBe("undo");
    expect(replyDeleteMode({})).toBe("confirm");
  });
});
