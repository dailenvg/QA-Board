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
  it("lets the author edit and delete their own, with Undo", () => {
    expect(commentRights(MINE, member)).toEqual({ edit: true, delete: "undo" });
    expect(commentRights(MINE, owner)).toEqual({ edit: true, delete: "undo" });
  });

  it("gives a member nothing on someone else's comment or a client's", () => {
    expect(commentRights(TEAM, member)).toEqual({ edit: false, delete: null });
    expect(commentRights(CLIENT, member)).toEqual({ edit: false, delete: null });
  });

  it("lets the owner delete someone else's only after a confirm, so there's no Undo toast", () => {
    expect(commentRights(TEAM, owner)).toEqual({ edit: false, delete: "confirm" });
  });

  it("lets the owner delete a client's at once, with Undo, but never edit it", () => {
    expect(commentRights(CLIENT, owner)).toEqual({ edit: false, delete: "undo" });
  });

  it("gives a shared link's guest nothing", () => {
    expect(commentRights(MINE, guest)).toEqual({ edit: false, delete: null });
  });
});
