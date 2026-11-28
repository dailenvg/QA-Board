import { describe, expect, it } from "vitest";
import type { Comment } from "@/lib/store/types";
import { commentRights } from "./comment-rights";

const TEAM: Comment = {
  id: "c-1",
  projectId: "p-1",
  x: 10,
  y: 20,
  body: "Tighten the hero.",
  author: "Ben",
  status: "active",
  createdAt: 1_000,
  updatedAt: 1_000,
};
const MINE: Comment = { ...TEAM, mine: true };
const CLIENT: Comment = { ...TEAM, fromClient: true };

const owner = { team: true, moderator: true };
const member = { team: true, moderator: false };
const guest = { team: false, moderator: false };

describe("commentRights", () => {
  it("lets the author edit and delete their own, with Undo, and change who sees it (D9)", () => {
    expect(commentRights(MINE, member)).toEqual({
      edit: true,
      delete: "undo",
      resolvedNote: false,
      share: true,
    });
    expect(commentRights(MINE, owner)).toEqual({
      edit: true,
      delete: "undo",
      resolvedNote: false,
      share: true,
    });
  });

  it("gives a member nothing on someone else's comment or a client's", () => {
    expect(commentRights(TEAM, member)).toEqual({
      edit: false,
      delete: null,
      resolvedNote: false,
      share: false,
    });
    expect(commentRights(CLIENT, member)).toEqual({
      edit: false,
      delete: null,
      resolvedNote: false,
      share: false,
    });
  });

  it("lets the owner delete someone else's only after a confirm, and change who sees it", () => {
    expect(commentRights(TEAM, owner)).toEqual({
      edit: false,
      delete: "confirm",
      resolvedNote: false,
      share: true,
    });
  });

  it("lets the owner delete a client's at once, with Undo, but never edit it or make it team only", () => {
    expect(commentRights(CLIENT, owner)).toEqual({
      edit: false,
      delete: "undo",
      resolvedNote: false,
      share: false,
    });
  });

  it("gives a shared link's guest nothing on comments they didn't post from this browser", () => {
    for (const comment of [TEAM, CLIENT, { ...TEAM, team: true as const }]) {
      expect(commentRights(comment, guest)).toEqual({
        edit: false,
        delete: null,
        resolvedNote: false,
        share: false,
      });
    }
  });

  it("lets a guest edit their own while it's active and the review is open, never delete it", () => {
    expect(commentRights(MINE, guest)).toEqual({
      edit: true,
      delete: null,
      resolvedNote: false,
      share: false,
    });
    expect(commentRights(MINE, { ...guest, reviewOpen: false })).toEqual({
      edit: false,
      delete: null,
      resolvedNote: false,
      share: false,
    });
  });

  it("tells a guest why their own resolved comment has no Edit", () => {
    const resolved: Comment = { ...MINE, status: "resolved" };
    expect(commentRights(resolved, guest)).toEqual({
      edit: false,
      delete: null,
      resolvedNote: true,
      share: false,
    });
    expect(commentRights(resolved, { ...guest, reviewOpen: false }).resolvedNote).toBe(true);
  });
});
