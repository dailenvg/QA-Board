import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

/** Every migration before 036: the schema production had when the review window shipped. */
const UP_TO_035 = MIGRATIONS.slice(0, 35);
const NEW = ["036_squint_shares_password", "037_squint_share_password_attempts"];
/** Up to the last of `NEW`: later migrations have their own tests. */
const UP_TO_037 = MIGRATIONS.slice(0, 35 + NEW.length);

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

const PROJECT = JSON.stringify({ name: "P", source: { kind: "url", url: "https://a.test/" } });

/** A database at 035: a workspace link (`linked`) and an anonymous share. */
async function at035(make: () => Promise<Database>) {
  const db = await make();
  expect(await migrate(db, UP_TO_035)).toHaveLength(35);
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ('acme', 'Acme') RETURNING id",
  );
  const workspaceId = rows[0]?.id ?? "";
  await db.query(
    `INSERT INTO projects (id, workspace_id, name, source)
     VALUES ('p1', $1, 'P', '{"kind":"url","url":"https://a.test/"}')`,
    [workspaceId],
  );
  await db.query(
    `INSERT INTO squint_shares (id, token_hash, owner_key_hash, project, created_at, updated_at,
       expires_at, workspace_id, project_id)
     VALUES ('linked', 'linked-token', 'linked-owner', $1::jsonb, 1, 1, NULL, $2, 'p1'),
       ('anonymous', 'anonymous-token', 'anonymous-owner', $1::jsonb, 1, 1, 10000, NULL, NULL)`,
    [PROJECT, workspaceId],
  );
  return db;
}

async function passwords(db: Database): Promise<Record<string, string | null>> {
  const { rows } = await db.query<{ id: string; password_hash: string | null }>(
    "SELECT id, password_hash FROM squint_shares ORDER BY id",
  );
  return Object.fromEntries(rows.map((row) => [row.id, row.password_hash]));
}

const SET = "UPDATE squint_shares SET password_hash = $2, password_set_at = $3 WHERE id = $1";

describe.each(databases)("migrations 036 and 037 (%s)", (_name, make) => {
  it("leaves every existing link open", async () => {
    const db = await at035(make);
    expect(await migrate(db, UP_TO_037)).toEqual(NEW);
    expect(await passwords(db)).toEqual({ anonymous: null, linked: null });
  });

  it("changes nothing when it runs again", async () => {
    const db = await at035(make);
    await migrate(db, UP_TO_037);
    await db.query(SET, ["linked", "$argon2id$hash", new Date(5)]);
    await db.query(
      "INSERT INTO squint_share_password_attempts (share_id, ip_hash) VALUES ('linked', 'ip')",
    );
    expect(await migrate(db, UP_TO_037)).toEqual([]);
    // By hand too: the columns, CHECKs, table and indexes are already there.
    for (const migration of MIGRATIONS.filter((m) => NEW.includes(m.id))) {
      await db.query(migration.sql);
    }
    expect(await passwords(db)).toEqual({ anonymous: null, linked: "$argon2id$hash" });
    const { rows } = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM squint_share_password_attempts",
    );
    expect(rows[0]?.count).toBe(1);
  });

  it("keeps a hash and its time together, and only on a workspace's link", async () => {
    const db = await at035(make);
    await migrate(db, UP_TO_037);
    await db.query(SET, ["linked", "$argon2id$hash", new Date(5)]);
    await db.query(SET, ["linked", null, null]);
    await expect(db.query(SET, ["linked", "$argon2id$hash", null])).rejects.toThrow();
    await expect(db.query(SET, ["linked", null, new Date(5)])).rejects.toThrow();
    await expect(db.query(SET, ["anonymous", "$argon2id$hash", new Date(5)])).rejects.toThrow();
  });

  it("deletes a share's attempts with the share", async () => {
    const db = await at035(make);
    await migrate(db, UP_TO_037);
    await db.query(
      `INSERT INTO squint_share_password_attempts (share_id, ip_hash)
       VALUES ('linked', 'a'), ('linked', 'b'), ('anonymous', 'a')`,
    );
    await db.query("DELETE FROM squint_shares WHERE id = 'linked'");
    const { rows } = await db.query<{ share_id: string }>(
      "SELECT share_id FROM squint_share_password_attempts",
    );
    expect(rows).toEqual([{ share_id: "anonymous" }]);
    await expect(
      db.query(
        "INSERT INTO squint_share_password_attempts (share_id, ip_hash) VALUES ('gone', 'a')",
      ),
    ).rejects.toThrow();
  });
});
