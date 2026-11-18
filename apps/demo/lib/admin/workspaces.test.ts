import { describe, expect, it } from "vitest";
import { addBlob } from "@/test/storage-fixture";
import {
  addFolder,
  memberSeat,
  NOW,
  seat,
  twoWorkspaces,
  URL_PROJECT,
} from "@/test/workspace-fixture";
import type { Queryable } from "../share/migrate";
import { createProject, trashProject } from "../workspace/projects";
import { loadAdminWorkspace, loadAdminWorkspaces } from "./workspaces";

const DAY = 24 * 60 * 60 * 1000;

async function setProjectUpdated(db: Queryable, id: string, at: number) {
  await db.query("UPDATE projects SET updated_at = $2 WHERE id = $1", [id, new Date(at)]);
}

async function addComment(db: Queryable, projectId: string, id: string, at: number) {
  await db.query(
    `INSERT INTO comments (project_id, id, x, y, body, author_name, created_at, updated_at)
     VALUES ($1, $2, 0, 0, 'Hi', 'Ana', $3, $3)`,
    [projectId, id, new Date(at)],
  );
}

async function addEntry(
  db: Queryable,
  workspaceId: string,
  actorUserId: string | null,
  at: number,
) {
  await db.query(
    "INSERT INTO audit_log (actor_user_id, workspace_id, action, at) VALUES ($1, $2, 'x.y', $3)",
    [actorUserId, workspaceId, new Date(at)],
  );
}

async function insertAdmin(db: Queryable): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO users (email, password_hash, role) VALUES ('admin@squint.test', 'x', 'admin') RETURNING id",
  );
  return rows[0]?.id ?? "";
}

describe("loadAdminWorkspaces", () => {
  it("lists each workspace with its owner, people, projects, storage and quota", async () => {
    const { db, a, b } = await twoWorkspaces();
    await memberSeat(db, a.workspaceId);
    const leaving = await memberSeat(db, a.workspaceId);
    await db.query("UPDATE users SET deleted_at = now() WHERE id = $1", [leaving.userId]);
    await addFolder(db, a.workspaceId);
    for (const id of ["one", "two", "binned"]) {
      await createProject(db, a.workspaceId, URL_PROJECT(id), NOW);
    }
    await trashProject(db, a.workspaceId, "binned", NOW);
    await addBlob(db, a.workspaceId, `ws/${a.workspaceId}/brand/logo/a.png`, 1500);
    await db.query("UPDATE workspaces SET storage_quota_bytes = 1000 WHERE id = $1", [
      b.workspaceId,
    ]);

    const { active, archived } = await loadAdminWorkspaces(db);
    expect(archived).toEqual([]);
    expect(active.map((workspace) => workspace.slug)).toEqual(["acme", "bravo"]);
    expect(active[0]).toMatchObject({
      id: a.workspaceId,
      name: "acme",
      members: 2,
      projects: 2,
      usedBytes: 1500,
      quotaBytes: 5 * 1024 ** 3,
      status: "active",
      archivedAt: null,
      suspendedAt: null,
      deleteAfter: null,
    });
    expect(active[0]?.ownerEmail).toMatch(/^owner-\d+@acme\.test$/);
    expect(active[0]?.ownerActive).toBe(true);
    expect(active[1]).toMatchObject({ members: 1, projects: 0, usedBytes: 0, quotaBytes: 1000 });
  });

  it("says when each was last active: its projects, comments and its own people's changes", async () => {
    const { db, a, b } = await twoWorkspaces();
    const admin = await insertAdmin(db);
    await addFolder(db, a.workspaceId);
    await createProject(db, a.workspaceId, URL_PROJECT("site"), NOW);
    await setProjectUpdated(db, "site", NOW - 5 * DAY);

    const read = async () =>
      Object.fromEntries(
        (await loadAdminWorkspaces(db)).active.map((workspace) => [
          workspace.id,
          workspace.lastActivityAt,
        ]),
      );

    expect(await read()).toEqual({ [a.workspaceId]: NOW - 5 * DAY, [b.workspaceId]: null });
    await addComment(db, "site", "c1", NOW - 3 * DAY);
    expect((await read())[a.workspaceId]).toBe(NOW - 3 * DAY);
    await addEntry(db, a.workspaceId, a.userId, NOW - 2 * DAY);
    expect((await read())[a.workspaceId]).toBe(NOW - 2 * DAY);
    // The admin's own actions and Squint's cron aren't the workspace's activity.
    await addEntry(db, a.workspaceId, admin, NOW - DAY);
    await addEntry(db, a.workspaceId, null, NOW);
    await addEntry(db, b.workspaceId, admin, NOW);
    expect(await read()).toEqual({ [a.workspaceId]: NOW - 2 * DAY, [b.workspaceId]: null });
  });

  it("lists archived workspaces apart, newest first, each with its own status", async () => {
    const { db, a, b } = await twoWorkspaces();
    const c = await seat(db, "charlie");
    await db.query("UPDATE workspaces SET archived_at = $2 WHERE id = $1", [
      a.workspaceId,
      new Date(NOW - DAY),
    ]);
    await db.query("UPDATE workspaces SET archived_at = $2, suspended_at = $2 WHERE id = $1", [
      b.workspaceId,
      new Date(NOW),
    ]);
    await db.query("UPDATE workspaces SET suspended_at = $2, delete_after = $3 WHERE id = $1", [
      c.workspaceId,
      new Date(NOW),
      new Date(NOW + DAY),
    ]);

    const { active, archived } = await loadAdminWorkspaces(db);
    expect(active.map(({ slug, status }) => ({ slug, status }))).toEqual([
      { slug: "charlie", status: "deleting" },
    ]);
    expect(archived.map(({ slug, status, archivedAt }) => ({ slug, status, archivedAt }))).toEqual([
      { slug: "bravo", status: "suspended", archivedAt: NOW },
      { slug: "acme", status: "active", archivedAt: NOW - DAY },
    ]);
  });

  it("keeps a deleted owner's email, but says they can't be sent a reset link", async () => {
    const { db, a, b } = await twoWorkspaces();
    await db.query("UPDATE users SET deleted_at = now() WHERE id = $1", [a.userId]);
    await db.query("DELETE FROM memberships WHERE workspace_id = $1", [b.workspaceId]);
    const owners = (await loadAdminWorkspaces(db)).active.map(({ ownerEmail, ownerActive }) => ({
      owner: ownerEmail !== null,
      ownerActive,
    }));
    expect(owners).toEqual([
      { owner: true, ownerActive: false },
      { owner: false, ownerActive: false },
    ]);
  });

  it("reads one workspace by id, and nothing for an unknown one", async () => {
    const { db, a } = await twoWorkspaces();
    expect(await loadAdminWorkspace(db, a.workspaceId)).toMatchObject({ id: a.workspaceId });
    expect(await loadAdminWorkspace(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
