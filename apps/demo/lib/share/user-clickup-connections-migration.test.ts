import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

const UP_TO_039 = MIGRATIONS.slice(0, 39);
const NEW = "040_user_clickup_connections";
const UP_TO_040 = MIGRATIONS.slice(0, 40);

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const databases: Array<[string, () => Promise<Database>]> = [
  ["PGlite", () => Promise.resolve(adaptPglite(new PGlite()))],
  ...(TEST_DATABASE_URL
    ? [
        [
          "Postgres",
          async () => {
            const fresh = await freshSchema(TEST_DATABASE_URL as string);
            closers.push(() => fresh.close());
            return fresh.db;
          },
        ] as [string, () => Promise<Database>],
      ]
    : []),
];

async function insertWorkspace(db: Database, slug: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ($1, $1) RETURNING id",
    [slug],
  );
  return rows[0]?.id ?? "";
}

async function insertMember(
  db: Database,
  email: string,
  workspaceId: string,
  role: "owner" | "member",
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO users (email, password_hash, role) VALUES ($1, 'x', 'company') RETURNING id",
    [email],
  );
  const userId = rows[0]?.id ?? "";
  await db.query("INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, $3)", [
    userId,
    workspaceId,
    role,
  ]);
  return userId;
}

const LEGACY = `INSERT INTO workspace_clickup_connections (workspace_id, clickup_team_id,
    clickup_team_name, clickup_user_id, clickup_username, access_token_sealed, connected_by,
    connected_at)
  VALUES ($1, '9012', 'Acme Design', '81', 'Ana Ruiz', $2, $3, '2026-11-12T10:00:00Z')`;

const CONNECT = `INSERT INTO user_clickup_connections (user_id, workspace_id, clickup_team_id,
    clickup_team_name, clickup_user_id, clickup_username, access_token_sealed)
  VALUES ($1, $2, '9012', 'Acme Design', '81', 'Ana Ruiz', 'sealed')`;

/**
 * A database at 039 with three workspaces' ClickUp connections: Acme's,
 * made by its owner; Bravo's, whose connector has since left it; and
 * Charlie's, whose connector's account is gone (039 named nobody then).
 */
async function at039(make: () => Promise<Database>) {
  const db = await make();
  expect(await migrate(db, UP_TO_039)).toHaveLength(39);
  const acme = await insertWorkspace(db, "acme");
  const bravo = await insertWorkspace(db, "bravo");
  const charlie = await insertWorkspace(db, "charlie");
  const owner = await insertMember(db, "ana@acme.test", acme, "owner");
  const leaver = await insertMember(db, "bo@bravo.test", bravo, "member");
  await db.query(LEGACY, [acme, "sealed-acme", owner]);
  await db.query(LEGACY, [bravo, "sealed-bravo", leaver]);
  await db.query(LEGACY, [charlie, "sealed-charlie", null]);
  await db.query("DELETE FROM memberships WHERE user_id = $1", [leaver]);
  return { db, acme, bravo, charlie, owner, leaver };
}

async function connections(db: Database) {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT user_id, workspace_id, clickup_team_id, clickup_team_name, clickup_user_id,
       clickup_username, access_token_sealed, sealed_for, connected_at
     FROM user_clickup_connections ORDER BY workspace_id`,
  );
  return rows;
}

describe.each(databases)("migration 040 (%s)", (_name, make) => {
  it("copies each connection to its connector while they're still a member, marked as sealed to the workspace", async () => {
    const { db, acme, owner } = await at039(make);
    expect(await migrate(db, UP_TO_040)).toEqual([NEW]);
    expect(await connections(db)).toEqual([
      {
        user_id: owner,
        workspace_id: acme,
        clickup_team_id: "9012",
        clickup_team_name: "Acme Design",
        clickup_user_id: "81",
        clickup_username: "Ana Ruiz",
        access_token_sealed: "sealed-acme",
        sealed_for: "workspace",
        connected_at: new Date("2026-11-12T10:00:00Z"),
      },
    ]);
    // 039 is left as it was, for the app to clear row by row.
    const { rows } = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM workspace_clickup_connections",
    );
    expect(rows[0]?.count).toBe(3);
  });

  it("keeps one connection per member per workspace, sealed to them unless copied", async () => {
    const { db, acme, owner, bravo } = await at039(make);
    await migrate(db, UP_TO_040);
    await db.query("DELETE FROM user_clickup_connections");
    await db.query(CONNECT, [owner, acme]);
    await expect(db.query(CONNECT, [owner, acme])).rejects.toThrow();
    const { rows } = await db.query("SELECT sealed_for FROM user_clickup_connections");
    expect(rows).toEqual([{ sealed_for: "user" }]);
    await expect(
      db.query("UPDATE user_clickup_connections SET sealed_for = 'team'"),
    ).rejects.toThrow();
    // Only a member of the workspace can have one there.
    await expect(db.query(CONNECT, [owner, bravo])).rejects.toThrow();
  });

  it("goes when its member leaves, their memberships are purged, or the workspace is deleted", async () => {
    const { db, acme, owner, bravo } = await at039(make);
    await migrate(db, UP_TO_040);
    const member = await insertMember(db, "cy@acme.test", acme, "member");
    const other = await insertMember(db, "di@bravo.test", bravo, "member");
    await db.query(CONNECT, [member, acme]);
    await db.query(CONNECT, [other, bravo]);

    await db.query("DELETE FROM memberships WHERE user_id = $1", [member]);
    expect((await connections(db)).map((row) => row.user_id).sort()).toEqual([owner, other].sort());

    // A soft-deleted account keeps it, for a restore; the purge deletes its memberships.
    await db.query(
      "UPDATE users SET deleted_at = now(), delete_after = now() + interval '30 days' WHERE id = $1",
      [other],
    );
    expect(await connections(db)).toHaveLength(2);
    await db.query("DELETE FROM memberships WHERE user_id = $1", [other]);
    expect((await connections(db)).map((row) => row.user_id)).toEqual([owner]);

    await db.query("DELETE FROM workspaces WHERE id = $1", [acme]);
    expect(await connections(db)).toEqual([]);
  });

  it("changes nothing when it runs again", async () => {
    const { db, acme, owner } = await at039(make);
    await migrate(db, UP_TO_040);
    await db.query(
      `UPDATE user_clickup_connections SET access_token_sealed = 'resealed', sealed_for = 'user'
       WHERE user_id = $1`,
      [owner],
    );
    expect(await migrate(db, UP_TO_040)).toEqual([]);
    await db.query(MIGRATIONS.find((m) => m.id === NEW)?.sql ?? "");
    expect(await connections(db)).toMatchObject([
      { user_id: owner, workspace_id: acme, access_token_sealed: "resealed", sealed_for: "user" },
    ]);
  });
});
