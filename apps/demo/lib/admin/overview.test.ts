import { describe, expect, it } from "vitest";
import { addBlob } from "@/test/storage-fixture";
import { addFolder, NOW, twoWorkspaces, URL_PROJECT } from "@/test/workspace-fixture";
import type { Queryable } from "../share/migrate";
import { createProject, setArchived, trashProject } from "../workspace/projects";
import {
  ACTIVITY_DAYS,
  dailyActivity,
  loadAdminActivity,
  loadAdminCounts,
  utcDayStart,
} from "./overview";
import { DAY_MS } from "./utc-format";

const TODAY = utcDayStart(NOW);

async function addComment(db: Queryable, projectId: string, id: string) {
  await db.query(
    "INSERT INTO comments (project_id, id, x, y, body, author_name) VALUES ($1, $2, 0, 0, 'Hi', 'Ana')",
    [projectId, id],
  );
}

let shares = 0;

/** A share row: anonymous unless `workspaceId` is given; `expiresAt` null for a workspace's. */
async function addShare(
  db: Queryable,
  {
    workspaceId = null,
    projectId = null,
    expiresAt = null,
  }: { workspaceId?: string | null; projectId?: string | null; expiresAt?: number | null },
) {
  shares += 1;
  await db.query(
    `INSERT INTO squint_shares (id, token_hash, owner_key_hash, project, created_at, updated_at,
       expires_at, workspace_id, project_id)
     VALUES ($1, $1, $1, '{}'::jsonb, $2, $2, $3, $4, $5)`,
    [`share-${shares}`, NOW, expiresAt, workspaceId, projectId],
  );
}

async function addEntry(db: Queryable, action: string, at: number) {
  await db.query("INSERT INTO audit_log (action, at) VALUES ($1, $2)", [action, new Date(at)]);
}

describe("loadAdminCounts", () => {
  it("counts every workspace, live accounts, projects and comments outside the trash, live links and stored bytes", async () => {
    const { db, a, b } = await twoWorkspaces();
    await db.query(
      "INSERT INTO users (email, password_hash, role) VALUES ('admin@squint.test', 'x', 'admin')",
    );
    await db.query(
      "INSERT INTO users (email, password_hash, role, deleted_at) VALUES ('gone@acme.test', 'x', 'company', now())",
    );
    await addFolder(db, a.workspaceId);
    for (const id of ["live", "trashed", "archived"]) {
      await createProject(db, a.workspaceId, URL_PROJECT(id), NOW);
    }
    await trashProject(db, a.workspaceId, "trashed", NOW);
    await setArchived(db, a.workspaceId, "archived", true, NOW);
    await addComment(db, "live", "c1");
    await addComment(db, "live", "c2");
    await addComment(db, "archived", "c3");
    await addComment(db, "trashed", "c4");

    // Live: an anonymous share before its date, and the live project's link.
    await addShare(db, { expiresAt: NOW + DAY_MS });
    await addShare(db, { workspaceId: a.workspaceId, projectId: "live" });
    // Not live: expired, its project in the trash or archived, or its workspace due for deletion.
    await addShare(db, { expiresAt: NOW - 1 });
    await addShare(db, { workspaceId: a.workspaceId, projectId: "trashed" });
    await addShare(db, { workspaceId: a.workspaceId, projectId: "archived" });
    await addShare(db, { workspaceId: b.workspaceId });
    await db.query("UPDATE workspaces SET delete_after = now() WHERE id = $1", [b.workspaceId]);

    await addBlob(db, a.workspaceId, `ws/${a.workspaceId}/brand/logo/a.png`, 1000);
    await addBlob(db, b.workspaceId, `ws/${b.workspaceId}/brand/logo/b.png`, 234);

    expect(await loadAdminCounts(db, NOW)).toEqual({
      workspaces: 2,
      users: 3,
      projects: 2,
      comments: 3,
      activeShares: 2,
      storageBytes: 1234,
    });
  });

  it("reads an empty Squint as zeros", async () => {
    const { db } = await twoWorkspaces();
    await db.query("DELETE FROM workspaces");
    await db.query("DELETE FROM users");
    expect(await loadAdminCounts(db, NOW)).toEqual({
      workspaces: 0,
      users: 0,
      projects: 0,
      comments: 0,
      activeShares: 0,
      storageBytes: 0,
    });
  });
});

describe("dailyActivity", () => {
  it(`fills all ${ACTIVITY_DAYS} days, empty ones as 0, today last`, () => {
    const activity = dailyActivity(
      [
        { day: TODAY, action: "user.name_changed", count: 2 },
        { day: TODAY, action: "share.settings_changed", count: 1 },
        { day: TODAY - 2 * DAY_MS, action: "membership.added", count: 4 },
        { day: TODAY - 2 * DAY_MS, action: "member.invited", count: 1 },
      ],
      TODAY,
    );
    expect(activity.firstDay).toBe(TODAY - (ACTIVITY_DAYS - 1) * DAY_MS);
    expect(activity.perDay).toHaveLength(ACTIVITY_DAYS);
    expect(activity.perDay.at(-1)).toBe(3);
    expect(activity.perDay.at(-2)).toBe(0);
    expect(activity.perDay.at(-3)).toBe(5);
    expect(activity.perDay.slice(0, -3).every((count) => count === 0)).toBe(true);
    expect(activity.total).toBe(8);
    expect(activity.categories.map(({ category, total }) => [category, total])).toEqual([
      ["account", 2],
      ["people", 5],
      ["reviewLinks", 1],
    ]);
    const people = activity.categories.find((series) => series.category === "people");
    expect(people?.perDay.at(-3)).toBe(5);
    expect(people?.perDay).toHaveLength(ACTIVITY_DAYS);
  });

  it("leaves out days before the first or after today, and lists no category without entries", () => {
    const activity = dailyActivity(
      [
        { day: TODAY - ACTIVITY_DAYS * DAY_MS, action: "user.name_changed", count: 9 },
        { day: TODAY + DAY_MS, action: "user.name_changed", count: 9 },
        { day: TODAY - (ACTIVITY_DAYS - 1) * DAY_MS, action: "seed.user_created", count: 1 },
      ],
      TODAY,
    );
    expect(activity.perDay[0]).toBe(1);
    expect(activity.total).toBe(1);
    expect(activity.categories).toEqual([{ category: "other", perDay: activity.perDay, total: 1 }]);
  });

  it("is all zeros without any entry", () => {
    const activity = dailyActivity([], TODAY);
    expect(activity.perDay).toEqual(Array(ACTIVITY_DAYS).fill(0));
    expect(activity.total).toBe(0);
    expect(activity.categories).toEqual([]);
  });
});

describe("loadAdminActivity", () => {
  it("buckets the audit log by UTC day, from the first day's midnight to the end of today", async () => {
    const { db } = await twoWorkspaces();
    const firstDay = TODAY - (ACTIVITY_DAYS - 1) * DAY_MS;
    await addEntry(db, "user.name_changed", TODAY + 1);
    await addEntry(db, "user.name_changed", TODAY + DAY_MS - 1);
    await addEntry(db, "project.deleted", TODAY - 1);
    await addEntry(db, "share.password_set", firstDay);
    // Just before the range, and tomorrow: neither counts.
    await addEntry(db, "share.password_set", firstDay - 1);
    await addEntry(db, "share.password_set", TODAY + DAY_MS);

    const activity = await loadAdminActivity(db, NOW);
    expect(activity.firstDay).toBe(firstDay);
    expect(activity.perDay.at(-1)).toBe(2);
    expect(activity.perDay.at(-2)).toBe(1);
    expect(activity.perDay[0]).toBe(1);
    expect(activity.total).toBe(4);
    expect(activity.categories.map(({ category, total }) => [category, total])).toEqual([
      ["account", 2],
      ["projects", 1],
      ["reviewLinks", 1],
    ]);
  });
});
