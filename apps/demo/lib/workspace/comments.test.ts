import { describe, expect, it } from "vitest";
import { addFolder, NOW, PAGES_PROJECT, twoWorkspaces } from "@/test/workspace-fixture";
import { addComment, deleteComment, listComments, updateComment } from "./comments";
import { createProject } from "./projects";

const INPUT = {
  id: "c1",
  x: 10,
  y: 20,
  body: "Tighten this",
  author: "Ana",
  status: "active" as const,
};

describe("comments", () => {
  it("adds a comment on a page, by the member, and reads it back as the browser's shape", async () => {
    const { db, a } = await twoWorkspaces();
    await addFolder(db, a.workspaceId);
    await createProject(db, a.workspaceId, PAGES_PROJECT("p1"), NOW);
    const added = await addComment(
      db,
      a.workspaceId,
      "p1",
      { ...INPUT, pageId: "page-1" },
      a.userId,
      NOW,
    );
    expect(added).toEqual({
      ok: true,
      value: { ...INPUT, projectId: "p1", pageId: "page-1", createdAt: NOW, updatedAt: NOW },
    });
    const { rows } = await db.query<{ author_user_id: string }>(
      "SELECT author_user_id FROM comments",
    );
    expect(rows[0]?.author_user_id).toBe(a.userId);
    expect(await addComment(db, a.workspaceId, "p1", INPUT, a.userId, NOW)).toEqual({
      ok: false,
      reason: "exists",
    });
  });

  it("refuses a page or snapshot the project doesn't have", async () => {
    const { db, a } = await twoWorkspaces();
    await addFolder(db, a.workspaceId);
    await createProject(db, a.workspaceId, PAGES_PROJECT("p1"), NOW);
    for (const surface of [{ pageId: "page-9" }, { snapshotId: "s9" }]) {
      expect(
        await addComment(db, a.workspaceId, "p1", { ...INPUT, ...surface }, null, NOW),
      ).toEqual({
        ok: false,
        reason: "unknown-surface",
      });
    }
  });

  it("edits, resolves, reopens, adds a crop and deletes", async () => {
    const { db, a } = await twoWorkspaces();
    await addFolder(db, a.workspaceId);
    await createProject(db, a.workspaceId, PAGES_PROJECT("p1"), NOW);
    await addComment(db, a.workspaceId, "p1", { ...INPUT, pageId: "page-1" }, null, NOW);
    const resolved = await updateComment(
      db,
      a.workspaceId,
      "p1",
      "c1",
      { status: "resolved" },
      NOW + 1,
    );
    expect(resolved).toMatchObject({ status: "resolved", resolvedAt: NOW + 1, updatedAt: NOW + 1 });
    const crop = { blobKey: "crop:c1", rect: { x: 0, y: 0, width: 10, height: 10 } };
    const edited = await updateComment(
      db,
      a.workspaceId,
      "p1",
      "c1",
      { body: "Better", crop },
      NOW + 2,
    );
    expect(edited).toMatchObject({ body: "Better", crop, status: "resolved", resolvedAt: NOW + 1 });
    const reopened = await updateComment(
      db,
      a.workspaceId,
      "p1",
      "c1",
      { status: "active" },
      NOW + 3,
    );
    expect(reopened).not.toHaveProperty("resolvedAt");
    expect(await updateComment(db, a.workspaceId, "p1", "nope", { body: "X" }, NOW)).toBeNull();
    expect(await deleteComment(db, a.workspaceId, "p1", "c1")).toBe(true);
    expect(await listComments(db, a.workspaceId)).toEqual([]);
  });
});
