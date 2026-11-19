import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

const UP_TO_047 = MIGRATIONS.slice(0, 47);
const UP_TO_048 = MIGRATIONS.slice(0, 48);
const BETTER_AUTH_CORE = MIGRATIONS.find(({ id }) => id === "048_better_auth_core");
const HASHED_TOKEN = "a".repeat(64);

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

/** A user and a session as the code before 048 writes them; returns the user's id. */
async function legacyAccount(db: Database): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO users (email, password_hash, role) VALUES ('ana@acme.test', 'hash', 'company') RETURNING id",
  );
  const userId = rows[0]?.id ?? "";
  await db.query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day')",
    [HASHED_TOKEN, userId],
  );
  return userId;
}

describe.each(databases)("048_better_auth_core on %s", (_name, make) => {
  it("fills the new columns of existing rows, and changes nothing the second time", async () => {
    const db = await make();
    expect(await migrate(db, UP_TO_047)).toHaveLength(47);
    expect(UP_TO_047.at(-1)?.id).toBe("047_cron_runs");
    await legacyAccount(db);
    expect(await migrate(db, UP_TO_048)).toEqual(["048_better_auth_core"]);
    await db.query(BETTER_AUTH_CORE?.sql ?? "");
    const { rows: users } = await db.query<Record<string, unknown>>(
      "SELECT email_verified, image, updated_at FROM users",
    );
    expect(users).toEqual([
      { email_verified: true, image: null, updated_at: expect.any(Date) as unknown },
    ]);
    const { rows: sessions } = await db.query<Record<string, unknown>>(
      "SELECT id, updated_at, ip_address, user_agent FROM sessions",
    );
    expect(sessions).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
        updated_at: expect.any(Date) as unknown,
        ip_address: null,
        user_agent: null,
      },
    ]);
  });

  it("still takes a session the old way, and now a plain token too, each with its own id", async () => {
    const db = await make();
    await migrate(db);
    const userId = await legacyAccount(db);
    await db.query(
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('PlainBetterAuthToken0123456789ab', $1, now())",
      [userId],
    );
    const { rows } = await db.query<{ count: string }>(
      "SELECT count(DISTINCT id)::text AS count FROM sessions",
    );
    expect(rows).toEqual([{ count: "2" }]);
    await expect(
      db.query(
        "INSERT INTO sessions (id, token_hash, user_id, expires_at) SELECT id, 'other', user_id, now() FROM sessions LIMIT 1",
      ),
    ).rejects.toThrow();
  });

  it("shows each user's password as one credential account, and writes it back to users", async () => {
    const db = await make();
    await migrate(db);
    const userId = await legacyAccount(db);
    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT id, account_id, provider_id, user_id, password, access_token, scope FROM auth_accounts`,
    );
    expect(rows).toEqual([
      {
        id: userId,
        account_id: userId,
        provider_id: "credential",
        user_id: userId,
        password: "hash",
        access_token: null,
        scope: null,
      },
    ]);
    await db.query("UPDATE auth_accounts SET password = 'new hash' WHERE user_id = $1", [userId]);
    const { rows: users } = await db.query("SELECT password_hash FROM users");
    expect(users).toEqual([{ password_hash: "new hash" }]);
  });
});
