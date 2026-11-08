import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertUser } from "@/test/accounts-fixture";
import { poolDatabase, type Database } from "../db/database";
import { migrate } from "../share/migrate";
import { logIn, recordLogin, type LoginResult } from "./login";
import { MAX_FAILURES_PER_EMAIL, MAX_FAILURES_PER_IP } from "./rate-limit";

/**
 * The login limits under real concurrency. PGlite runs one transaction at a
 * time, so this needs a real Postgres: set TEST_DATABASE_URL to a throwaway
 * local one (127.0.0.1 or localhost only). Skipped otherwise. Every run uses
 * fresh emails and addresses, so it leaves the database usable.
 */
const url = process.env.TEST_DATABASE_URL?.trim();
const local = url ? ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname) : false;
if (url && !local) throw new Error("TEST_DATABASE_URL must point at 127.0.0.1 or localhost.");

/** Answers other than 429: attempts that got as far as checking a password. */
function checked(results: LoginResult[]): number {
  return results.filter((result) => result.ok || result.reason !== "rate-limited").length;
}

describe.skipIf(!url)("login rate limit on Postgres, in parallel", () => {
  let pool: Pool;
  let db: Database;

  beforeAll(async () => {
    // Enough connections that the claims really run side by side.
    pool = new Pool({ connectionString: url, max: 12 });
    await migrate(pool);
    db = poolDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("lets at most 5 of 30 parallel wrong passwords for one email through", async () => {
    const email = `race-${randomUUID()}@e2e.test`;
    await insertUser(db, email);
    const now = Date.now();
    const results = await Promise.all(
      Array.from({ length: 30 }, () =>
        logIn(db, { email, password: "wrong", ip: `race-ip-${randomUUID()}` }, now),
      ),
    );
    expect(checked(results)).toBe(MAX_FAILURES_PER_EMAIL);
    const { rows } = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM login_attempts WHERE email = $1",
      [email],
    );
    expect(rows[0]?.count).toBe(MAX_FAILURES_PER_EMAIL);
  });

  it("lets at most 20 of 40 parallel attempts from one address through", async () => {
    const ip = `race-ip-${randomUUID()}`;
    const now = Date.now();
    const results = await Promise.all(
      Array.from({ length: 40 }, () =>
        logIn(db, { email: `race-${randomUUID()}@e2e.test`, password: "wrong", ip }, now),
      ),
    );
    expect(checked(results)).toBe(MAX_FAILURES_PER_IP);
  });

  it("tells a sign-in that waited on another one that it isn't the first", async () => {
    const userId = await insertUser(db, `first-${randomUUID()}@e2e.test`);
    const now = Date.now();
    const held = await pool.connect();
    try {
      await held.query("BEGIN");
      expect(await recordLogin(held, userId, now)).toBe(true);
      const second = recordLogin(db, userId, now + 1000);
      // Long enough for the second to reach the row and wait on it.
      await new Promise((resolve) => setTimeout(resolve, 200));
      await held.query("COMMIT");
      expect(await second).toBe(false);
    } finally {
      held.release();
    }
  });
});
