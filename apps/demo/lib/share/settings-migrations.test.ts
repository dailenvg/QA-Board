import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

/** Every migration before 029: the schema production had when the profile settings shipped. */
const UP_TO_028 = MIGRATIONS.slice(0, 28);
const NEW = ["029_user_blobs", "030_workspaces_sender_name_length"];

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

async function insertWorkspace(db: Database, slug: string, sender: string | null) {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name, from_email_name) VALUES ($1, $1, $2) RETURNING id",
    [slug, sender],
  );
  return rows[0]?.id ?? "";
}

describe.each(databases)("migrations 029 and 030 (%s)", (_name, make) => {
  it("put legacy sender names right, so every workspace can still be updated", async () => {
    const db = await make();
    await migrate(db, UP_TO_028);
    // Sender name before 030, and what it becomes.
    const cases: Array<[string | null, string | null]> = [
      ["S".repeat(100), "S".repeat(64)],
      ["   ", null],
      ["", null],
      [`  ${"a".repeat(63)} ${"b".repeat(10)}`, "a".repeat(63)],
      ["  ONE Creative  ", "  ONE Creative  "],
      [null, null],
    ];
    const ids: string[] = [];
    for (const [index, [sender]] of cases.entries()) {
      ids.push(await insertWorkspace(db, `legacy-${index}`, sender));
    }
    expect(await migrate(db)).toEqual(NEW);
    expect(await migrate(db)).toEqual([]);
    for (const migration of MIGRATIONS.filter((m) => NEW.includes(m.id))) {
      await db.query(migration.sql);
    }
    for (const [index, [, expected]] of cases.entries()) {
      const { rows } = await db.query<{ from_email_name: string | null }>(
        "UPDATE workspaces SET name = 'Renamed' WHERE id = $1 RETURNING from_email_name",
        [ids[index]],
      );
      expect(rows[0]?.from_email_name, String(index)).toBe(expected);
    }
  });

  it("checks sender names written from now on: 1 to 64 characters once trimmed, or none", async () => {
    const db = await make();
    await migrate(db);
    const id = await insertWorkspace(db, "acme", null);
    const rename = (sender: string | null) =>
      db.query("UPDATE workspaces SET from_email_name = $2 WHERE id = $1", [id, sender]);
    await rename("S".repeat(64));
    await rename(null);
    await expect(rename("S".repeat(65))).rejects.toThrow(/from_email_name_length/);
    await expect(rename("  ")).rejects.toThrow(/from_email_name_length/);
  });

  it("keeps each avatar file in exactly one place, and with its user", async () => {
    const db = await make();
    await migrate(db);
    const { rows } = await db.query<{ id: string }>(
      "INSERT INTO users (email, password_hash, role) VALUES ('ana@acme.test', 'x', 'company') RETURNING id",
    );
    const userId = rows[0]?.id ?? "";
    const insert = (key: string, url: string | null, bytes: Uint8Array | null) =>
      db.query(
        `INSERT INTO user_blobs (user_id, key, content_type, size, blob_url, bytes)
         VALUES ($1, $2, 'image/png', 3, $3, $4)`,
        [userId, key, url, bytes],
      );
    await insert("user/a/avatar/1", null, new Uint8Array([1, 2, 3]));
    await insert("user/a/avatar/2", "https://store.test/x", null);
    await expect(insert("user/a/avatar/3", null, null)).rejects.toThrow(/one_location/);
    await expect(
      insert("user/a/avatar/4", "https://store.test/y", new Uint8Array([1])),
    ).rejects.toThrow(/one_location/);
    await expect(insert("user/a/avatar/1", null, new Uint8Array([1]))).rejects.toThrow(
      /duplicate key|unique/,
    );
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
    expect((await db.query("SELECT 1 FROM user_blobs")).rows).toEqual([]);
  });
});
