import { describe, expect, it } from "vitest";
import type { Comment } from "@/lib/store/types";
import { listedOnTab } from "./listed-on-tab";

const comment = (id: string, status: Comment["status"] = "active"): Comment => ({
  id,
  projectId: "p-1",
  x: 1,
  y: 1,
  body: id,
  author: "Cleo",
  status,
  createdAt: 1,
  updatedAt: 1,
});

describe("listedOnTab", () => {
  it("lists the tab's comments only, while no editor is open", () => {
    const comments = [comment("a"), comment("b", "resolved"), comment("c")];
    expect(listedOnTab(comments, "active", new Map()).map((entry) => entry.id)).toEqual(["a", "c"]);
    expect(listedOnTab(comments, "resolved", new Map()).map((entry) => entry.id)).toEqual(["b"]);
  });

  it("keeps a comment being edited in place once the team resolves it", () => {
    const comments = [comment("a"), comment("b", "resolved")];
    const editing = new Map([["b", comment("b")]]);
    const listed = listedOnTab(comments, "active", editing);
    expect(listed.map((entry) => entry.id)).toEqual(["a", "b"]);
    // As it is now: the card knows it's resolved once its editor closes.
    expect(listed[1]?.status).toBe("resolved");
  });

  it("keeps a comment being edited once it's deleted, as it was when the editor opened", () => {
    const editing = new Map([["gone", comment("gone")]]);
    expect(listedOnTab([comment("a")], "active", editing).map((entry) => entry.id)).toEqual([
      "a",
      "gone",
    ]);
  });
});
