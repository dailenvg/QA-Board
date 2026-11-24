import { describe, expect, it } from "vitest";
import type { Reply } from "@/lib/store/types";
import type { CommentViewer } from "./comment-rights";
import { canReply, replyRights } from "./reply-rights";

const TEAM: Reply = {
  id: "r-1",
  projectId: "p-1",
  commentId: "c-1",
  body: "On it.",
  author: "Ben",
  createdAt: 1_000,
};
const MINE: Reply = { ...TEAM, mine: true };
const CLIENT: Reply = { ...TEAM, fromClient: true };

const owner: CommentViewer = { team: true, moderator: true };
const member: CommentViewer = { team: true, moderator: false };
const guest: CommentViewer = { team: false, moderator: false };

describe("replyRights", () => {
  it("lets the author edit and delete their own, with Undo, owner or not", () => {
    for (const viewer of [member, owner]) {
      expect(replyRights(MINE, viewer)).toEqual({ edit: true, delete: "undo", getInfo: true });
    }
  });

  it("gives a member only Get info on someone else's reply or a client's", () => {
    for (const reply of [TEAM, CLIENT]) {
      expect(replyRights(reply, member)).toEqual({ edit: false, delete: null, getInfo: true });
    }
  });

  it("lets the owner delete anyone else's after a confirm, and never edit it", () => {
    for (const reply of [TEAM, CLIENT]) {
      expect(replyRights(reply, owner)).toEqual({ edit: false, delete: "confirm", getInfo: true });
    }
  });

  it("gives a review link's guest nothing, not even on a reply from their browser", () => {
    for (const reply of [TEAM, CLIENT, MINE, { ...TEAM, team: true as const }]) {
      expect(replyRights(reply, guest)).toEqual({ edit: false, delete: null, getInfo: false });
    }
  });
});

describe("canReply", () => {
  it("gives everyone on the team the reply box, and no guest yet", () => {
    expect(canReply(owner)).toBe(true);
    expect(canReply(member)).toBe(true);
    expect(canReply(guest)).toBe(false);
    expect(canReply({ ...guest, reviewOpen: true })).toBe(false);
  });
});
