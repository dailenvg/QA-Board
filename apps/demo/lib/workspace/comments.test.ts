import { describe, expect, it } from "vitest";
import { addFolder, memberSeat, NOW, PAGES_PROJECT, twoWorkspaces } from "@/test/workspace-fixture";
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

const MINUTE = 60_000;

/** Workspace A with a page project, its owner, and a member (Ben, default switches). */
async function setup() {
  const { db, a, b } = await twoWorkspaces();
  await addFolder(db, a.workspaceId);
  await createProject(db, a.workspaceId, PAGES_PROJECT("p1"), NOW);
  const ben = await memberSeat(db, a.workspaceId, undefined, "Ben Ito");
  return { db, a, b, ben };
}

async function editedAtOf(db: Awaited<ReturnType<typeof setup>>["db"], id: string) {
  const { rows } = await db.query<{ edited_at: Date | null }>(
    "SELECT edited_at FROM comments WHERE id = $1",
    [id],
  );
  return rows[0]?.edited_at?.getTime() ?? null;
}

describe("comments", () => {
  it("adds a comment on a page, by the member, and reads it back as the browser's shape", async () => {
    const { db, a } = await setup();
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
      value: {
        ...INPUT,
        projectId: "p1",
        pageId: "page-1",
        createdAt: NOW,
        updatedAt: NOW,
        mine: true,
      },
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
    const { db, a } = await setup();
    for (const surface of [{ pageId: "page-9" }, { snapshotId: "s9" }]) {
      expect(
        await addComment(db, a.workspaceId, "p1", { ...INPUT, ...surface }, null, NOW),
      ).toEqual({
        ok: false,
        reason: "unknown-surface",
      });
    }
  });

  it("edits, resolves, reopens, adds a crop and deletes the author's own", async () => {
    const { db, a } = await setup();
    await addComment(db, a.workspaceId, "p1", { ...INPUT, pageId: "page-1" }, a.userId, NOW);
    const resolved = await updateComment(
      db,
      a.workspaceId,
      "p1",
      "c1",
      { status: "resolved" },
      NOW + 1,
      a,
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
      a,
    );
    expect(edited).toMatchObject({
      body: "Better",
      crop,
      status: "resolved",
      resolvedAt: NOW + 1,
      editedAt: NOW + 2,
      mine: true,
    });
    const reopened = await updateComment(
      db,
      a.workspaceId,
      "p1",
      "c1",
      { status: "active" },
      NOW + 3,
      a,
    );
    expect(reopened).not.toHaveProperty("resolvedAt");
    expect(await updateComment(db, a.workspaceId, "p1", "nope", { body: "X" }, NOW, a)).toBeNull();
    expect(
      await deleteComment(db, a.workspaceId, "p1", "c1", { userId: a.userId, canModerate: false }),
    ).toBe(true);
    expect(await listComments(db, a.workspaceId)).toEqual([]);
  });

  it("marks a comment without an author account as a client's, never sending whose it is", async () => {
    const { db, a } = await setup();
    const guest = { ...INPUT, id: "guest", pageId: "page-1" };
    const added = await addComment(db, a.workspaceId, "p1", guest, null, NOW);
    expect(added).toEqual({
      ok: true,
      value: { ...guest, projectId: "p1", createdAt: NOW, updatedAt: NOW, fromClient: true },
    });
    await addComment(db, a.workspaceId, "p1", { ...INPUT, pageId: "page-1" }, a.userId, NOW);
    const listed = await listComments(db, a.workspaceId, undefined, a.userId);
    expect(listed.map((comment) => [comment.id, comment.fromClient, comment.mine])).toEqual([
      ["c1", undefined, true],
      ["guest", true, undefined],
    ]);
    expect(
      await updateComment(db, a.workspaceId, "p1", "guest", { status: "resolved" }, NOW, a),
    ).toMatchObject({ fromClient: true, status: "resolved" });
    expect(JSON.stringify(listed)).not.toContain(a.userId);
  });

  it("keeps a member's comment the team's after their account is deleted", async () => {
    const { db, a } = await setup();
    await addComment(db, a.workspaceId, "p1", { ...INPUT, pageId: "page-1" }, a.userId, NOW);
    await db.query("DELETE FROM users WHERE id = $1", [a.userId]);
    const { rows } = await db.query<{ author_user_id: string | null; origin: string }>(
      "SELECT author_user_id, origin FROM comments WHERE id = 'c1'",
    );
    // The account is gone (ON DELETE SET NULL), but whose comment it was stays.
    expect(rows).toEqual([{ author_user_id: null, origin: "team" }]);
    expect(await listComments(db, a.workspaceId)).toEqual([
      expect.not.objectContaining({ fromClient: true }),
    ]);
  });
});

describe("comments with several people (decision 6)", () => {
  it("posts under the member's own name, whatever the body says, and shows renames everywhere", async () => {
    const { db, a, ben } = await setup();
    const posted = await addComment(
      db,
      a.workspaceId,
      "p1",
      { ...INPUT, pageId: "page-1", author: "Ana Ruiz" },
      ben.userId,
      NOW,
    );
    expect(posted).toMatchObject({ ok: true, value: { author: "Ben Ito", mine: true } });
    // Without a name yet, the typed one stands in.
    await addComment(db, a.workspaceId, "p1", { ...INPUT, id: "c2", author: "Ana" }, a.userId, NOW);
    await db.query("UPDATE users SET name = 'Benjamin Ito' WHERE id = $1", [ben.userId]);
    const listed = await listComments(db, a.workspaceId, undefined, a.userId);
    expect(listed.map((comment) => [comment.id, comment.author, comment.mine])).toEqual([
      ["c1", "Benjamin Ito", undefined],
      ["c2", "Ana", true],
    ]);
  });

  it("shows a client's name as they gave it, even when an account has the same id", async () => {
    const { db, a } = await setup();
    await addComment(db, a.workspaceId, "p1", { ...INPUT, author: "Cleo" }, null, NOW);
    await db.query("UPDATE users SET name = 'Ana Ruiz' WHERE id = $1", [a.userId]);
    expect(await listComments(db, a.workspaceId)).toMatchObject([{ author: "Cleo" }]);
  });

  it("lets only the author change the text or crop: the owner gets a 404's null too", async () => {
    const { db, a, ben } = await setup();
    await addComment(db, a.workspaceId, "p1", { ...INPUT, pageId: "page-1" }, ben.userId, NOW);
    const crop = { blobKey: "crop:c1", rect: { x: 0, y: 0, width: 10, height: 10 } };
    for (const patch of [
      { body: "Ana's words" },
      { crop },
      { body: "X", status: "resolved" as const },
    ]) {
      expect(await updateComment(db, a.workspaceId, "p1", "c1", patch, NOW + 1, a)).toBeNull();
    }
    expect(await listComments(db, a.workspaceId)).toMatchObject([
      { body: INPUT.body, status: "active", updatedAt: NOW },
    ]);
    expect(
      await updateComment(db, a.workspaceId, "p1", "c1", { body: "Ben's words" }, NOW + 2, ben),
    ).toMatchObject({ body: "Ben's words", editedAt: NOW + 2 });
  });

  it("lets anyone resolve and reopen anyone's comment, a client's included", async () => {
    const { db, a, ben } = await setup();
    await addComment(db, a.workspaceId, "p1", INPUT, a.userId, NOW);
    await addComment(db, a.workspaceId, "p1", { ...INPUT, id: "guest" }, null, NOW);
    for (const id of ["c1", "guest"]) {
      expect(
        await updateComment(db, a.workspaceId, "p1", id, { status: "resolved" }, NOW + 1, ben),
      ).toMatchObject({ status: "resolved" });
      expect(
        await updateComment(db, a.workspaceId, "p1", id, { status: "active" }, NOW + 2, ben),
      ).toMatchObject({ status: "active" });
    }
  });

  it("never lets anyone change a client's words", async () => {
    const { db, a } = await setup();
    await addComment(db, a.workspaceId, "p1", { ...INPUT, id: "guest" }, null, NOW);
    expect(
      await updateComment(db, a.workspaceId, "p1", "guest", { body: "Changed" }, NOW + 1, a),
    ).toBeNull();
  });

  it("deletes the author's own, or anyone's for the owner; a member can't delete others'", async () => {
    const { db, a, ben } = await setup();
    const member = { userId: ben.userId, canModerate: false };
    const owner = { userId: a.userId, canModerate: true };
    await addComment(db, a.workspaceId, "p1", INPUT, a.userId, NOW);
    await addComment(db, a.workspaceId, "p1", { ...INPUT, id: "bens" }, ben.userId, NOW);
    await addComment(db, a.workspaceId, "p1", { ...INPUT, id: "guest" }, null, NOW);
    expect(await deleteComment(db, a.workspaceId, "p1", "c1", member)).toBe(false);
    expect(await deleteComment(db, a.workspaceId, "p1", "guest", member)).toBe(false);
    expect(await deleteComment(db, a.workspaceId, "p1", "bens", member)).toBe(true);
    expect(await deleteComment(db, a.workspaceId, "p1", "guest", owner)).toBe(true);
    await addComment(db, a.workspaceId, "p1", { ...INPUT, id: "bens2" }, ben.userId, NOW);
    expect(await deleteComment(db, a.workspaceId, "p1", "bens2", owner)).toBe(true);
    expect((await listComments(db, a.workspaceId)).map((comment) => comment.id)).toEqual(["c1"]);
  });

  it("says which comments are mine only to their author", async () => {
    const { db, a, ben } = await setup();
    await addComment(db, a.workspaceId, "p1", INPUT, a.userId, NOW);
    expect(await listComments(db, a.workspaceId, "p1", a.userId)).toMatchObject([{ mine: true }]);
    expect((await listComments(db, a.workspaceId, "p1", ben.userId))[0]).not.toHaveProperty("mine");
  });
});

describe("when a comment was edited (042)", () => {
  it("marks a change of words only: not the same text, a status or a crop", async () => {
    const { db, a } = await setup();
    await addComment(db, a.workspaceId, "p1", INPUT, a.userId, NOW);
    const crop = { blobKey: "crop:c1", rect: { x: 0, y: 0, width: 10, height: 10 } };
    for (const [patch, at] of [
      [{ crop }, NOW + 1],
      [{ status: "resolved" as const }, NOW + 2],
      [{ status: "active" as const }, NOW + 3],
      [{ body: INPUT.body }, NOW + 4],
    ] as const) {
      const changed = await updateComment(db, a.workspaceId, "p1", "c1", patch, at, a);
      expect(changed).toMatchObject({ updatedAt: at });
      expect(changed).not.toHaveProperty("editedAt");
    }
    expect(await editedAtOf(db, "c1")).toBeNull();
    await updateComment(db, a.workspaceId, "p1", "c1", { body: "New words" }, NOW + 5, a);
    await updateComment(db, a.workspaceId, "p1", "c1", { status: "resolved" }, NOW + 6, a);
    expect(await editedAtOf(db, "c1")).toBe(NOW + 5);
  });

  it("keeps a restored comment's editedAt, between its creation and now", async () => {
    const { db, a } = await setup();
    const restored = await addComment(
      db,
      a.workspaceId,
      "p1",
      { ...INPUT, createdAt: NOW - 10 * MINUTE, editedAt: NOW - 5 * MINUTE },
      a.userId,
      NOW,
    );
    expect(restored).toMatchObject({ ok: true, value: { editedAt: NOW - 5 * MINUTE } });
  });

  it("clamps an editedAt from before the comment was made to when it was made", async () => {
    const { db, a } = await setup();
    const early = await addComment(
      db,
      a.workspaceId,
      "p1",
      { ...INPUT, createdAt: NOW - 10 * MINUTE, editedAt: NOW - 60 * MINUTE },
      a.userId,
      NOW,
    );
    expect(early).toMatchObject({ ok: true, value: { editedAt: NOW - 10 * MINUTE } });
    expect(await editedAtOf(db, "c1")).toBe(NOW - 10 * MINUTE);
  });

  it("clamps an editedAt after now to now", async () => {
    const { db, a } = await setup();
    const future = await addComment(
      db,
      a.workspaceId,
      "p1",
      { ...INPUT, createdAt: NOW - MINUTE, editedAt: NOW + 24 * 60 * MINUTE },
      a.userId,
      NOW,
    );
    expect(future).toMatchObject({ ok: true, value: { editedAt: NOW } });
    expect(await editedAtOf(db, "c1")).toBe(NOW);
  });

  it("sets editedAt from a new comment only on the caller's own row", async () => {
    const { db, a, ben } = await setup();
    const withEdit = { createdAt: NOW - 10 * MINUTE, editedAt: NOW - 5 * MINUTE };
    // A guest's comment never takes it from the browser.
    await addComment(db, a.workspaceId, "p1", { ...INPUT, id: "guest", ...withEdit }, null, NOW);
    expect(await editedAtOf(db, "guest")).toBeNull();
    // Someone else's comment with that id stays as it was: the post is refused, nothing changes.
    await addComment(db, a.workspaceId, "p1", { ...INPUT, id: "bens" }, ben.userId, NOW);
    expect(
      await addComment(
        db,
        a.workspaceId,
        "p1",
        { ...INPUT, id: "bens", ...withEdit },
        a.userId,
        NOW,
      ),
    ).toEqual({ ok: false, reason: "exists" });
    expect(await editedAtOf(db, "bens")).toBeNull();
    // The caller's own new comment keeps it.
    await addComment(db, a.workspaceId, "p1", { ...INPUT, id: "anas", ...withEdit }, a.userId, NOW);
    expect(await editedAtOf(db, "anas")).toBe(NOW - 5 * MINUTE);
  });
});
