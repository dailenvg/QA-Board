import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

const UP_TO_037 = MIGRATIONS.slice(0, 37);
const NEW = "038_squint_share_invites";
const UP_TO_038 = MIGRATIONS.slice(0, 38);

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

/** A database at 037 with a workspace, its owner and a link on one of its projects. */
async function at037(make: () => Promise<Database>) {
  const db = await make();
  expect(await migrate(db, UP_TO_037)).toHaveLength(37);
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ('acme', 'Acme') RETURNING id",
  );
  const workspaceId = rows[0]?.id ?? "";
  const { rows: users } = await db.query<{ id: string }>(
    "INSERT INTO users (email, password_hash, role) VALUES ('ana@acme.test', 'x', 'company') RETURNING id",
  );
  await db.query(
    `INSERT INTO projects (id, workspace_id, name, source)
     VALUES ('p1', $1, 'P', '{"kind":"url","url":"https://a.test/"}')`,
    [workspaceId],
  );
  await db.query(
    `INSERT INTO squint_shares (id, token_hash, owner_key_hash, project, created_at, updated_at,
       expires_at, workspace_id, project_id)
     VALUES ('linked', 'linked-token', 'linked-owner', '{}'::jsonb, 1, 1, NULL, $1, 'p1')`,
    [workspaceId],
  );
  return { db, workspaceId, userId: users[0]?.id ?? "" };
}

const NAME = "UPDATE squint_shares SET client_name = $1 WHERE id = 'linked'";

describe.each(databases)("migration 038 (%s)", (_name, make) => {
  it("names nobody and counts nobody on every existing link", async () => {
    const { db } = await at037(make);
    expect(await migrate(db, UP_TO_038)).toEqual([NEW]);
    const { rows } = await db.query("SELECT client_name, invited_count FROM squint_shares");
    expect(rows).toEqual([{ client_name: null, invited_count: 0 }]);
  });

  it("keeps a client name trimmed and 1 to 80 characters", async () => {
    const { db } = await at037(make);
    await migrate(db, UP_TO_038);
    await db.query(NAME, ["Acme Studio"]);
    await db.query(NAME, ["a".repeat(80)]);
    await db.query(NAME, [null]);
    for (const bad of ["", " Acme", "Acme ", "a".repeat(81)]) {
      await expect(db.query(NAME, [bad]), JSON.stringify(bad)).rejects.toThrow(
        /client_name_length/,
      );
    }
    await expect(
      db.query("UPDATE squint_shares SET invited_count = -1 WHERE id = 'linked'"),
    ).rejects.toThrow(/invited_count/);
  });

  it("keeps sends without addresses, gone with their workspace, kept when their sender goes", async () => {
    const { db, workspaceId, userId } = await at037(make);
    await migrate(db, UP_TO_038);
    await db.query(
      "INSERT INTO squint_share_invite_sends (workspace_id, user_id) VALUES ($1, $2), ($1, $2)",
      [workspaceId, userId],
    );
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
    const { rows } = await db.query("SELECT user_id FROM squint_share_invite_sends");
    expect(rows).toEqual([{ user_id: null }, { user_id: null }]);
    await db.query("DELETE FROM squint_shares");
    await db.query("DELETE FROM projects");
    await db.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    const { rows: left } = await db.query("SELECT 1 FROM squint_share_invite_sends");
    expect(left).toEqual([]);
  });

  it("changes nothing when it runs again", async () => {
    const { db, workspaceId } = await at037(make);
    await migrate(db, UP_TO_038);
    await db.query(NAME, ["Acme Studio"]);
    await db.query("UPDATE squint_shares SET invited_count = 3");
    await db.query("INSERT INTO squint_share_invite_sends (workspace_id) VALUES ($1)", [
      workspaceId,
    ]);
    expect(await migrate(db, UP_TO_038)).toEqual([]);
    const migration = MIGRATIONS.find((m) => m.id === NEW);
    await db.query(migration?.sql ?? "");
    const { rows } = await db.query("SELECT client_name, invited_count FROM squint_shares");
    expect(rows).toEqual([{ client_name: "Acme Studio", invited_count: 3 }]);
    const { rows: sends } = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM squint_share_invite_sends",
    );
    expect(sends[0]?.count).toBe(1);
  });
});
