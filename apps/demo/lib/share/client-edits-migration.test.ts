import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

const UP_TO_044 = MIGRATIONS.slice(0, 44);
const NEW = ["045_client_comment_edits"];
/** Up to the last of `NEW`: later migrations have their own tests. */
const UP_TO_045 = MIGRATIONS.slice(0, 44 + NEW.length);

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

/** A database at 044 with a share holding an owner comment and a client one. */
async function at044(make: () => Promise<Database>) {
  const db = await make();
  expect(await migrate(db, UP_TO_044)).toHaveLength(44);
  await db.query(
    `INSERT INTO squint_shares
       (id, token_hash, owner_key_hash, project, created_at, updated_at, expires_at)
     VALUES ('s1', $1, $2, '{}'::jsonb, 1, 1, 2)`,
    ["a".repeat(64), "b".repeat(64)],
  );
  await db.query(
    `INSERT INTO squint_share_comments (share_id, id, data, origin)
     VALUES ('s1', 'owner-1', '{"body":"Hi"}'::jsonb, 'owner'),
            ('s1', 'client-1', '{"body":"Hello"}'::jsonb, 'client')`,
  );
  return db;
}

const COLUMNS =
  "SELECT id, edit_key_hash, edit_seq::int AS edit_seq FROM squint_share_comments ORDER BY id";

describe.each(databases)("migration 045 (%s)", (_name, make) => {
  it("leaves every existing comment without an edit key or edit, so none is editable", async () => {
    const db = await at044(make);
    expect(await migrate(db, UP_TO_045)).toEqual(NEW);
    const { rows } = await db.query(COLUMNS);
    expect(rows).toEqual([
      { id: "client-1", edit_key_hash: null, edit_seq: null },
      { id: "owner-1", edit_key_hash: null, edit_seq: null },
    ]);
  });

  it("takes a sha256 hex hash, and refuses anything else", async () => {
    const db = await at044(make);
    await migrate(db, UP_TO_045);
    await db.query("UPDATE squint_share_comments SET edit_key_hash = $1 WHERE id = 'client-1'", [
      "0f".repeat(32),
    ]);
    for (const value of ["plain-key", "A".repeat(64), "0f".repeat(31)]) {
      await expect(
        db.query("UPDATE squint_share_comments SET edit_key_hash = $1 WHERE id = 'client-1'", [
          value,
        ]),
        value,
      ).rejects.toThrow();
    }
  });

  it("indexes edits by share and edit sequence", async () => {
    const db = await at044(make);
    await migrate(db, UP_TO_045);
    const { rows } = await db.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'squint_share_comments_edit_seq_idx'",
    );
    expect(rows[0]?.indexdef).toMatch(/\(share_id, edit_seq\) WHERE \(edit_seq IS NOT NULL\)/);
  });

  it("changes nothing when it runs again", async () => {
    const db = await at044(make);
    await migrate(db, UP_TO_045);
    await db.query(
      "UPDATE squint_share_comments SET edit_key_hash = $1, edit_seq = 7 WHERE id = 'client-1'",
      ["0f".repeat(32)],
    );
    expect(await migrate(db, UP_TO_045)).toEqual([]);
    for (const id of NEW) await db.query(MIGRATIONS.find((m) => m.id === id)?.sql ?? "");
    const { rows } = await db.query(COLUMNS);
    expect(rows).toEqual([
      { id: "client-1", edit_key_hash: "0f".repeat(32), edit_seq: 7 },
      { id: "owner-1", edit_key_hash: null, edit_seq: null },
    ]);
    await expect(
      db.query("UPDATE squint_share_comments SET edit_key_hash = 'x' WHERE id = 'owner-1'"),
    ).rejects.toThrow();
  });
});
