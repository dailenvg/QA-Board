import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

const UP_TO_038 = MIGRATIONS.slice(0, 38);
const NEW = "039_workspace_clickup_connections";
const UP_TO_039 = MIGRATIONS.slice(0, 39);

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

/** A database at 038 with a workspace and its owner. */
async function at038(make: () => Promise<Database>) {
  const db = await make();
  expect(await migrate(db, UP_TO_038)).toHaveLength(38);
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ('acme', 'Acme') RETURNING id",
  );
  const { rows: users } = await db.query<{ id: string }>(
    "INSERT INTO users (email, password_hash, role) VALUES ('ana@acme.test', 'x', 'company') RETURNING id",
  );
  return { db, workspaceId: rows[0]?.id ?? "", userId: users[0]?.id ?? "" };
}

const CONNECT = `INSERT INTO workspace_clickup_connections (workspace_id, clickup_team_id,
    clickup_team_name, clickup_user_id, clickup_username, access_token_sealed, connected_by)
  VALUES ($1, $2, $3, '81', 'Ana Ruiz', 'sealed', $4)`;

describe.each(databases)("migration 039 (%s)", (_name, make) => {
  it("adds the table and nothing else, empty", async () => {
    const { db } = await at038(make);
    expect(await migrate(db, UP_TO_039)).toEqual([NEW]);
    const { rows } = await db.query("SELECT * FROM workspace_clickup_connections");
    expect(rows).toEqual([]);
  });

  it("keeps one connection per workspace, with a ClickUp workspace's id and name", async () => {
    const { db, workspaceId, userId } = await at038(make);
    await migrate(db, UP_TO_039);
    await db.query(CONNECT, [workspaceId, "9012", "Acme Design", userId]);
    await expect(db.query(CONNECT, [workspaceId, "9013", "Side", userId])).rejects.toThrow();
    for (const [id, name] of [
      ["", "Acme"],
      ["9012", ""],
      ["x".repeat(65), "Acme"],
      ["9012", "x".repeat(201)],
    ]) {
      await db.query("DELETE FROM workspace_clickup_connections");
      await expect(
        db.query(CONNECT, [workspaceId, id, name, userId]),
        `${id}/${name}`,
      ).rejects.toThrow();
    }
  });

  it("goes with its workspace, and outlives the user who connected it", async () => {
    const { db, workspaceId, userId } = await at038(make);
    await migrate(db, UP_TO_039);
    await db.query(CONNECT, [workspaceId, "9012", "Acme Design", userId]);
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
    const { rows } = await db.query("SELECT connected_by FROM workspace_clickup_connections");
    expect(rows).toEqual([{ connected_by: null }]);
    await db.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    const { rows: left } = await db.query("SELECT 1 FROM workspace_clickup_connections");
    expect(left).toEqual([]);
  });

  it("changes nothing when it runs again", async () => {
    const { db, workspaceId, userId } = await at038(make);
    await migrate(db, UP_TO_039);
    await db.query(CONNECT, [workspaceId, "9012", "Acme Design", userId]);
    expect(await migrate(db, UP_TO_039)).toEqual([]);
    await db.query(MIGRATIONS.find((m) => m.id === NEW)?.sql ?? "");
    const { rows } = await db.query("SELECT clickup_team_name FROM workspace_clickup_connections");
    expect(rows).toEqual([{ clickup_team_name: "Acme Design" }]);
  });
});
