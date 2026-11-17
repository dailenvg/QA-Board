import { describe, expect, it } from "vitest";
import { addFolder, NOW, twoWorkspaces, URL_PROJECT } from "@/test/workspace-fixture";
import type { Queryable } from "../share/migrate";
import { createProject } from "../workspace/projects";
import { auditHref, SQUINT_ACTOR } from "./audit-href";
import {
  AUDIT_PAGE_SIZE,
  formatCursor,
  loadAuditFilterOptions,
  loadAuditPage,
  parseAuditParams,
  type AuditParams,
} from "./audit-query";

interface Entry {
  action: string;
  at?: number;
  actor?: string | null;
  workspace?: string | null;
  target?: { type: string; id: string };
  meta?: Record<string, unknown>;
}

async function addEntry(db: Queryable, entry: Entry): Promise<void> {
  await db.query(
    `INSERT INTO audit_log (actor_user_id, workspace_id, action, target_type, target_id, meta, at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      entry.actor ?? null,
      entry.workspace ?? null,
      entry.action,
      entry.target?.type ?? null,
      entry.target?.id ?? null,
      JSON.stringify(entry.meta ?? {}),
      new Date(entry.at ?? NOW),
    ],
  );
}

const ID = "3f9c2b1e-8d4a-4c6b-9e2f-1a2b3c4d5e6f";

describe("parseAuditParams", () => {
  it("reads the filters and a cursor", () => {
    expect(
      parseAuditParams({
        workspace: ID.toUpperCase(),
        actor: SQUINT_ACTOR,
        action: "user.name_changed",
        before: "1793620800000000-42",
      }),
    ).toEqual({
      workspace: ID,
      actor: SQUINT_ACTOR,
      action: "user.name_changed",
      before: { micros: "1793620800000000", id: "42" },
    });
    expect(parseAuditParams({ actor: [ID, "other"], after: "1-2" })).toEqual({
      actor: ID,
      after: { micros: "1", id: "2" },
    });
  });

  it("drops what it can't read, one parameter at a time, never failing", () => {
    expect(
      parseAuditParams({
        workspace: "not-a-uuid",
        actor: "someone",
        action: "DROP TABLE users;",
        before: "-1-2",
        after: "12",
      }),
    ).toEqual({});
    expect(
      parseAuditParams({ action: "user.name_changed", before: "1".repeat(19) + "-1" }),
    ).toEqual({ action: "user.name_changed" });
  });

  it("keeps one direction: older wins", () => {
    expect(parseAuditParams({ before: "5-5", after: "1-1" })).toEqual({
      before: { micros: "5", id: "5" },
    });
  });
});

describe("auditHref", () => {
  it("carries the filters and a page, and nothing when there's neither", () => {
    expect(auditHref({})).toBe("/admin/audit");
    expect(auditHref({ workspace: ID, action: "user.name_changed" }, { before: "5-5" })).toBe(
      `/admin/audit?workspace=${ID}&action=user.name_changed&before=5-5`,
    );
    expect(auditHref({ actor: SQUINT_ACTOR }, { after: "1-1" })).toBe(
      "/admin/audit?actor=squint&after=1-1",
    );
  });
});

describe("loadAuditPage", () => {
  it("shows who, where and what, newest first, Squint for no actor and the id for a gone workspace", async () => {
    const { db, a } = await twoWorkspaces();
    await db.query("UPDATE users SET name = 'Ana' WHERE id = $1", [a.userId]);
    await addFolder(db, a.workspaceId);
    await createProject(db, a.workspaceId, URL_PROJECT("site"), NOW);
    const gone = crypto.randomUUID();
    await addEntry(db, {
      action: "share.invites_sent",
      at: NOW - 3000,
      actor: a.userId,
      workspace: a.workspaceId,
      target: { type: "project", id: "site" },
      meta: { fields: ["invites"], shareId: "share-1", recipients: ["hmac-a", "hmac-b"] },
    });
    await addEntry(db, {
      action: "workspace.deleted",
      at: NOW - 2000,
      workspace: gone,
      target: { type: "workspace", id: gone },
      meta: { fields: ["workspace"] },
    });
    await addEntry(db, {
      action: "user.name_changed",
      at: NOW - 1000,
      actor: a.userId,
      target: { type: "user", id: a.userId },
      meta: { fields: ["name"] },
    });

    const page = await loadAuditPage(db, {});
    expect(page.newer).toBeNull();
    expect(page.older).toBeNull();
    expect(page.entries.map((entry) => entry.action)).toEqual([
      "user.name_changed",
      "workspace.deleted",
      "share.invites_sent",
    ]);
    const [named, deleted, invites] = page.entries;
    expect(named).toMatchObject({
      at: NOW - 1000,
      actor: { id: a.userId, name: "Ana", deleted: false },
      workspace: null,
      target: { type: "user", id: a.userId, label: named?.actor?.email },
      details: { fields: ["name"] },
    });
    expect(deleted).toMatchObject({
      actor: null,
      workspace: { id: gone, name: null },
      target: { type: "workspace", id: gone, label: null },
    });
    expect(invites).toMatchObject({
      workspace: { id: a.workspaceId, name: "acme" },
      target: { type: "project", id: "site", label: "Project site" },
      details: { fields: ["invites"], recipients: 2 },
    });
    // The keyed HMACs and the share's id never leave the server.
    expect(JSON.stringify(page)).not.toMatch(/hmac-a|share-1/);
  });

  it("filters by workspace, by actor (a person, or Squint) and by action, together", async () => {
    const { db, a, b } = await twoWorkspaces();
    await addEntry(db, {
      action: "workspace.settings_changed",
      actor: a.userId,
      workspace: a.workspaceId,
    });
    await addEntry(db, {
      action: "workspace.logo_changed",
      actor: a.userId,
      workspace: a.workspaceId,
    });
    await addEntry(db, {
      action: "workspace.settings_changed",
      actor: b.userId,
      workspace: b.workspaceId,
    });
    await addEntry(db, { action: "project.deleted", workspace: a.workspaceId });
    await addEntry(db, { action: "user.name_changed", actor: a.userId });

    const actions = async (params: AuditParams) =>
      (await loadAuditPage(db, params)).entries.map((entry) => entry.action).sort();

    expect(await actions({ workspace: a.workspaceId })).toEqual([
      "project.deleted",
      "workspace.logo_changed",
      "workspace.settings_changed",
    ]);
    expect(await actions({ actor: a.userId })).toEqual([
      "user.name_changed",
      "workspace.logo_changed",
      "workspace.settings_changed",
    ]);
    expect(await actions({ actor: SQUINT_ACTOR })).toEqual(["project.deleted"]);
    expect(await actions({ action: "workspace.settings_changed" })).toHaveLength(2);
    expect(
      await actions({
        workspace: b.workspaceId,
        actor: a.userId,
        action: "workspace.settings_changed",
      }),
    ).toEqual([]);
    expect(await actions({ workspace: crypto.randomUUID() })).toEqual([]);
  });

  it("pages back and forth on (at, id) without skipping or repeating, ties included", async () => {
    const { db, a } = await twoWorkspaces();
    const total = AUDIT_PAGE_SIZE * 2 + 20;
    // Three entries share each moment, so pages break inside ties.
    for (let index = 0; index < total; index += 1) {
      await addEntry(db, {
        action: "user.name_changed",
        actor: a.userId,
        at: NOW - Math.floor(index / 3) * 1000,
      });
    }
    const first = await loadAuditPage(db, {});
    expect(first.entries).toHaveLength(AUDIT_PAGE_SIZE);
    expect(first.newer).toBeNull();
    expect(first.older).toBe(first.entries.at(-1)?.cursor);

    // An entry recorded while someone reads doesn't shift the next page.
    await addEntry(db, { action: "user.avatar_changed", actor: a.userId, at: NOW + 1000 });

    const older = (cursor: string | null) => parseAuditParams({ before: cursor ?? "" });
    const second = await loadAuditPage(db, older(first.older));
    const third = await loadAuditPage(db, older(second.older));
    expect(second.entries).toHaveLength(AUDIT_PAGE_SIZE);
    expect(third.entries).toHaveLength(20);
    expect(third.older).toBeNull();
    expect(third.newer).toBe(third.entries[0]?.cursor);

    const ids = [...first.entries, ...second.entries, ...third.entries].map((entry) => entry.id);
    expect(new Set(ids).size).toBe(total);
    const { rows } = await db.query<{ id: string }>(
      "SELECT id::text AS id FROM audit_log WHERE action = 'user.name_changed' ORDER BY at DESC, id DESC",
    );
    expect(ids).toEqual(rows.map((row) => row.id));

    // Newer from the third page is the second page again; newer from the second, the first.
    const back = await loadAuditPage(db, parseAuditParams({ after: third.newer ?? "" }));
    expect(back.entries.map((entry) => entry.id)).toEqual(second.entries.map((entry) => entry.id));
    expect(back.older).toBe(second.older);
    const top = await loadAuditPage(db, parseAuditParams({ after: second.newer ?? "" }));
    expect(top.entries.map((entry) => entry.id)).toEqual(first.entries.map((entry) => entry.id));
    // The entry added meanwhile is newer still.
    expect(top.newer).toBe(top.entries[0]?.cursor);
  });

  it("offers no way on from an empty page past a cursor", async () => {
    const { db } = await twoWorkspaces();
    await addEntry(db, { action: "user.name_changed", at: NOW });
    const page = await loadAuditPage(db, {
      before: { micros: String((NOW - 60_000) * 1000), id: "1" },
    });
    expect(page).toEqual({ entries: [], newer: null, older: null });
  });

  it("formats a cursor as it parses it", () => {
    const cursor = { micros: "1793620800123456", id: "42" };
    expect(parseAuditParams({ before: formatCursor(cursor) }).before).toEqual(cursor);
  });
});

describe("loadAuditFilterOptions", () => {
  it("offers every workspace then the gone ones, those who acted, Squint, and the actions on record", async () => {
    const { db, a, b } = await twoWorkspaces();
    const gone = crypto.randomUUID();
    await addEntry(db, {
      action: "workspace.settings_changed",
      actor: a.userId,
      workspace: a.workspaceId,
    });
    await addEntry(db, { action: "workspace.deleted", workspace: gone });
    await addEntry(db, { action: "project.deleted", workspace: gone });
    await addEntry(db, { action: "user.name_changed", actor: a.userId });

    const options = await loadAuditFilterOptions(db);
    expect(options.workspaces).toEqual([
      { id: a.workspaceId, name: "acme" },
      { id: b.workspaceId, name: "bravo" },
      { id: gone, name: null },
    ]);
    expect(options.actors.map((actor) => actor.id)).toEqual([a.userId]);
    expect(options.squint).toBe(true);
    expect(options.actions).toEqual([
      "project.deleted",
      "user.name_changed",
      "workspace.deleted",
      "workspace.settings_changed",
    ]);
  });

  it("offers no Squint before it has done anything", async () => {
    const { db, a } = await twoWorkspaces();
    await addEntry(db, { action: "user.name_changed", actor: a.userId });
    expect((await loadAuditFilterOptions(db)).squint).toBe(false);
  });
});
