import { describe, expect, it } from "vitest";
import type { Reply } from "@/lib/store/types";
import type { CommentViewer } from "./comment-rights";
import { canReply, REPLY_CLOSED_NOTE, replyClosedNote, replyRights } from "./reply-rights";

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
  it("lets the author edit and delete their own, with Undo, and change who sees it", () => {
    for (const viewer of [member, owner]) {
      expect(replyRights(MINE, viewer)).toEqual({
        edit: true,
        delete: "undo",
        getInfo: true,
        share: true,
      });
    }
  });

  it("gives a member only Get info on someone else's reply or a client's", () => {
    for (const reply of [TEAM, CLIENT]) {
      expect(replyRights(reply, member)).toEqual({
        edit: false,
        delete: null,
        getInfo: true,
        share: false,
      });
    }
  });

  it("lets the owner delete anyone else's after a confirm, never edit it, and share only the team's", () => {
    expect(replyRights(TEAM, owner)).toEqual({
      edit: false,
      delete: "confirm",
      getInfo: true,
      share: true,
    });
    expect(replyRights(CLIENT, owner)).toEqual({
      edit: false,
      delete: "confirm",
      getInfo: true,
      share: false,
    });
  });

  it("changes nobody's reply under a team-only comment, whose thread is the team's anyway", () => {
    expect(replyRights(MINE, member, true).share).toBe(false);
    expect(replyRights(TEAM, owner, true).share).toBe(false);
  });

  it("gives a review link's guest nothing, not even on a reply from their browser", () => {
    for (const reply of [TEAM, CLIENT, MINE, { ...TEAM, team: true as const }]) {
      expect(replyRights(reply, guest)).toEqual({
        edit: false,
        delete: null,
        getInfo: false,
        share: false,
      });
    }
  });
});

describe("canReply", () => {
  const active = { status: "active" } as const;
  const resolved = { status: "resolved" } as const;

  it("gives everyone on the team the reply box, under an active or a resolved comment", () => {
    for (const comment of [active, resolved]) {
      expect(canReply(owner, comment)).toBe(true);
      expect(canReply(member, comment)).toBe(true);
      expect(canReply({ ...member, reviewOpen: false }, comment)).toBe(true);
    }
  });

  it("gives a guest the box only under an active comment, while the window is open (D3, D4)", () => {
    expect(canReply(guest, active)).toBe(true);
    expect(canReply({ ...guest, reviewOpen: true }, active)).toBe(true);
    expect(canReply(guest, resolved)).toBe(false);
    expect(canReply({ ...guest, reviewOpen: false }, active)).toBe(false);
  });
});

describe("replyClosedNote", () => {
  const active = { status: "active" } as const;
  const resolved = { status: "resolved" } as const;
  const closed = { ...guest, reviewOpen: false };

  it("says nothing where there's a box, and never to the team", () => {
    expect(replyClosedNote(guest, active)).toBeNull();
    expect(replyClosedNote(owner, resolved)).toBeNull();
    expect(replyClosedNote({ ...member, reviewOpen: false }, resolved)).toBeNull();
  });

  it("tells a guest why there's none: the window first, then the resolve", () => {
    expect(replyClosedNote(guest, resolved)).toBe(REPLY_CLOSED_NOTE.resolved);
    expect(replyClosedNote(closed, active)).toBe(REPLY_CLOSED_NOTE.windowClosed);
    expect(replyClosedNote(closed, resolved)).toBe(REPLY_CLOSED_NOTE.windowClosed);
    expect(REPLY_CLOSED_NOTE).toEqual({
      windowClosed: "The review window has closed, so you can't reply.",
      resolved: "The team resolved this, so it's closed for replies.",
    });
  });
});
