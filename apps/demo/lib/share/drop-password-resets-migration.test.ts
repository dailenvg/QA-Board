import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

const UP_TO_050 = MIGRATIONS.slice(0, 50);
const DROP_PASSWORD_RESETS = MIGRATIONS.find(({ id }) => id === "051_drop_password_resets");

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

/** Whether `name` (a table or index) exists in the current schema. */
async function exists(db: Database, name: string): Promise<boolean> {
  const { rows } = await db.query<{ found: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS found",
    [name],
  );
  return rows[0]?.found ?? false;
}

describe.each(databases)("051_drop_password_resets on %s", (_name, make) => {
  it("drops the table and its index, keeps the links in verifications, and runs again", async () => {
    const db = await make();
    expect(await migrate(db, UP_TO_050)).toHaveLength(50);
    expect(UP_TO_050.at(-1)?.id).toBe("050_auth_organizations");
    const { rows } = await db.query<{ id: string }>(
      "INSERT INTO users (email, password_hash, role) VALUES ('ana@acme.test', 'x', 'company') RETURNING id",
    );
    const userId = rows[0]?.id ?? "";
    await db.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at, by_admin)
       VALUES ($1, repeat('a', 64), now() - interval '1 hour', true)`,
      [userId],
    );
    await db.query(
      `INSERT INTO verifications (identifier, value, expires_at)
       VALUES ($1, $2, now() + interval '1 hour')`,
      [`sha256:reset-password:${"b".repeat(64)}`, userId],
    );

    expect(await migrate(db)).toEqual(["051_drop_password_resets"]);
    await db.query(DROP_PASSWORD_RESETS?.sql ?? "");

    expect(await exists(db, "password_resets")).toBe(false);
    expect(await exists(db, "password_resets_user_idx")).toBe(false);
    const { rows: links } = await db.query("SELECT value FROM verifications");
    expect(links).toEqual([{ value: userId }]);
  });
});
