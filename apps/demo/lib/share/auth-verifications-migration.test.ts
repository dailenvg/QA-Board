import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { PASSWORD } from "@/test/accounts-fixture";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import { hashPassword, verifyPassword } from "../auth/password";
import { completePasswordReset, isResetTokenUsable } from "../auth/password-reset";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";
import { createSecret, hashSecret } from "./tokens";

const UP_TO_048 = MIGRATIONS.slice(0, 48);
const UP_TO_049 = MIGRATIONS.slice(0, 49);
const AUTH_VERIFICATIONS = MIGRATIONS.find(({ id }) => id === "049_auth_verifications");
const NEW_PASSWORD = "a brand new password";

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

interface LegacyLink {
  /** Seconds from now until it expires; negative for an expired link. */
  in: number;
  used?: boolean;
  byAdmin?: boolean;
}

/** A user, and reset links as the code before 049 wrote them; the link tokens and the user's id. */
async function legacyLinks(db: Database, links: LegacyLink[]) {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO users (email, password_hash, role) VALUES ('ana@acme.test', $1, 'company') RETURNING id",
    [await hashPassword(PASSWORD)],
  );
  const userId = rows[0]?.id ?? "";
  const tokens: string[] = [];
  for (const link of links) {
    const token = createSecret();
    tokens.push(token);
    await db.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at, used_at, by_admin)
       VALUES ($1, $2, now() + make_interval(secs => $3), $4, $5)`,
      [userId, hashSecret(token), link.in, link.used ? new Date() : null, link.byAdmin ?? false],
    );
  }
  return { userId, tokens };
}

describe.each(databases)("049_auth_verifications on %s", (_name, make) => {
  it("copies only the open links, hashed as Better Auth stores them, once", async () => {
    const db = await make();
    expect(await migrate(db, UP_TO_048)).toHaveLength(48);
    expect(UP_TO_048.at(-1)?.id).toBe("048_better_auth_core");
    const { userId, tokens } = await legacyLinks(db, [
      { in: 3000 },
      { in: 3000, byAdmin: true },
      { in: 3000, used: true },
      { in: -10 },
    ]);
    expect(await migrate(db, UP_TO_049)).toEqual(["049_auth_verifications"]);
    await db.query(AUTH_VERIFICATIONS?.sql ?? "");
    const { rows } = await db.query<Record<string, unknown>>(
      "SELECT identifier, value, by_admin FROM verifications ORDER BY by_admin",
    );
    expect(rows).toEqual(
      tokens.slice(0, 2).map((token, index) => ({
        identifier: `sha256:reset-password:${hashSecret(token)}`,
        value: userId,
        by_admin: index === 1,
      })),
    );
  });

  it("keeps a link emailed before the deploy working, once", async () => {
    const db = await make();
    await migrate(db, UP_TO_048);
    const { userId, tokens } = await legacyLinks(db, [{ in: 3000 }]);
    await migrate(db);
    const token = tokens[0] ?? "";
    const now = Date.now();
    expect(await isResetTokenUsable(db, token, now)).toBe(true);
    expect(await completePasswordReset(db, token, NEW_PASSWORD, now)).toBe(true);
    expect(await completePasswordReset(db, token, "another new password", now)).toBe(false);
    const { rows } = await db.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [userId],
    );
    expect(await verifyPassword(NEW_PASSWORD, rows[0]?.password_hash ?? null)).toBe(true);
  });
});
