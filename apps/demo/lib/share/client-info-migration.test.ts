import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

const UP_TO_051 = MIGRATIONS.slice(0, 51);
const NEW = ["052_client_info"];
/** Up to the last of `NEW`: later migrations have their own tests. */
const UP_TO_052 = MIGRATIONS.slice(0, 51 + NEW.length);

const STORED = { userAgent: "Mozilla/5.0", viewport: { width: 1440, height: 900 } };
const INFO = JSON.stringify(STORED);

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

/** A database at 051 with a workspace comment and a review link holding a client comment. */
async function at051(make: () => Promise<Database>) {
  const db = await make();
  expect(await migrate(db, UP_TO_051)).toHaveLength(51);
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ('acme', 'Acme') RETURNING id",
  );
  await db.query(
    `INSERT INTO projects (id, workspace_id, name, source)
     VALUES ('p1', $1, 'P', '{"kind":"url","url":"https://a.test/"}')`,
    [rows[0]?.id],
  );
  await db.query(
    `INSERT INTO comments (project_id, id, x, y, body, author_name)
     VALUES ('p1', 'c1', 1, 1, 'Hi', 'Ana')`,
  );
  await db.query(
    `INSERT INTO squint_shares
       (id, token_hash, owner_key_hash, project, created_at, updated_at, expires_at)
     VALUES ('s1', $1, $2, '{}'::jsonb, 1, 1, 2)`,
    ["a".repeat(64), "b".repeat(64)],
  );
  await db.query(
    `INSERT INTO squint_share_comments (share_id, id, data, origin)
     VALUES ('s1', 'client-1', '{"body":"Hello"}'::jsonb, 'client')`,
  );
  return db;
}

async function infos(db: Database): Promise<Record<string, unknown>> {
  const { rows } = await db.query<{ id: string; client_info: unknown }>(
    `SELECT id, client_info FROM comments
     UNION ALL SELECT id, client_info FROM squint_share_comments ORDER BY id`,
  );
  return Object.fromEntries(rows.map((row) => [row.id, row.client_info]));
}

describe.each(databases)("migration 052 (%s)", (_name, make) => {
  it("leaves every existing comment without browser details", async () => {
    const db = await at051(make);
    expect(await migrate(db, UP_TO_052)).toEqual(NEW);
    expect(await infos(db)).toEqual({ c1: null, "client-1": null });
  });

  it("takes a JSON object, and refuses any other JSON", async () => {
    const db = await at051(make);
    await migrate(db, UP_TO_052);
    await db.query("UPDATE comments SET client_info = $1::jsonb", [INFO]);
    await db.query("UPDATE squint_share_comments SET client_info = $1::jsonb", [INFO]);
    for (const value of ['"Mozilla/5.0"', "[1, 2]", "42", "null", "true"]) {
      for (const table of ["comments", "squint_share_comments"]) {
        await expect(
          db.query(`UPDATE ${table} SET client_info = $1::jsonb`, [value]),
          `${table} ${value}`,
        ).rejects.toThrow();
      }
    }
  });

  it("changes nothing when it runs again", async () => {
    const db = await at051(make);
    await migrate(db, UP_TO_052);
    await db.query("UPDATE comments SET client_info = $1::jsonb", [INFO]);
    expect(await migrate(db, UP_TO_052)).toEqual([]);
    for (const id of NEW) await db.query(MIGRATIONS.find((m) => m.id === id)?.sql ?? "");
    expect(await infos(db)).toEqual({ c1: STORED, "client-1": null });
    await expect(
      db.query("UPDATE squint_share_comments SET client_info = '[]'::jsonb"),
    ).rejects.toThrow();
  });
});
