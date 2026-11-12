import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migratedPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { migrate } from "./migrate";
import {
  addressKey,
  claimPasswordAttempt,
  MAX_FAILURES_PER_ADDRESS,
  MAX_FAILURES_PER_LINK,
  PASSWORD_WINDOW_MS,
  prunePasswordAttempts,
  releasePasswordClaim,
  type PasswordAttemptKey,
} from "./password-attempts";

const SECRET = "test-auth-secret-0123456789abcdef";
const NOW = Date.UTC(2026, 10, 12, 9);
const MINUTE = 60_000;

/** Shares `s0`…`s{count-1}` (rows only, enough for the attempts' foreign key). */
async function addShares(db: Database, count: number) {
  for (let index = 0; index < count; index += 1) {
    await db.query(
      `INSERT INTO squint_shares (id, token_hash, owner_key_hash, project, created_at, updated_at,
         expires_at)
       VALUES ($1, $1 || '-token', $1 || '-owner', '{}'::jsonb, 1, 1, 1)`,
      [`s${index}`],
    );
  }
}

const key = (share: number, ip = "198.51.100.7"): PasswordAttemptKey => ({
  shareId: `s${share}`,
  ipHash: addressKey(ip, SECRET),
});

/** Claims `count` attempts at `at`, each left as a failure. */
async function fail(db: Database, attempt: PasswordAttemptKey, count: number, at = NOW) {
  for (let index = 0; index < count; index += 1) {
    expect(await claimPasswordAttempt(db, attempt, at)).toMatchObject({ ok: true });
  }
}

async function rowCount(db: Database): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM squint_share_password_attempts",
  );
  return rows[0]?.count ?? 0;
}

describe("review link password limits", () => {
  let db: Database;

  beforeEach(async () => {
    db = await migratedPglite();
    await addShares(db, 8);
  });

  it("are 5 per link and address, and 30 per address, in 15 minutes", () => {
    expect(MAX_FAILURES_PER_LINK).toBe(5);
    expect(MAX_FAILURES_PER_ADDRESS).toBe(30);
    expect(PASSWORD_WINDOW_MS).toBe(15 * MINUTE);
  });

  it("refuses a 6th try on a link from one address until its oldest failure ages out", async () => {
    await fail(db, key(0), 4, NOW);
    await fail(db, key(0), 1, NOW + 5 * MINUTE);
    const refused = await claimPasswordAttempt(db, key(0), NOW + 6 * MINUTE);
    expect(refused).toEqual({ ok: false, retryAfterSeconds: 9 * 60 });
    // Refusals aren't recorded, so waiting works.
    expect(await rowCount(db)).toBe(5);
    expect(await claimPasswordAttempt(db, key(0), NOW + 15 * MINUTE - 1)).toMatchObject({
      ok: false,
      retryAfterSeconds: 1,
    });
    expect(await claimPasswordAttempt(db, key(0), NOW + 15 * MINUTE)).toMatchObject({ ok: true });
  });

  it("keeps other addresses on that link, and that address on other links, going", async () => {
    await fail(db, key(0), MAX_FAILURES_PER_LINK);
    expect(await claimPasswordAttempt(db, key(0), NOW)).toMatchObject({ ok: false });
    expect(await claimPasswordAttempt(db, key(0, "203.0.113.9"), NOW)).toMatchObject({ ok: true });
    expect(await claimPasswordAttempt(db, key(1), NOW)).toMatchObject({ ok: true });
  });

  it("refuses an address after 30 failures across links, and on every link", async () => {
    for (let share = 0; share < 6; share += 1) await fail(db, key(share), 5);
    expect(await claimPasswordAttempt(db, key(6), NOW + MINUTE)).toEqual({
      ok: false,
      retryAfterSeconds: 14 * 60,
    });
    expect(await claimPasswordAttempt(db, key(7, "203.0.113.9"), NOW + MINUTE)).toMatchObject({
      ok: true,
    });
    expect(await claimPasswordAttempt(db, key(6), NOW + 15 * MINUTE)).toMatchObject({ ok: true });
  });

  it("starts a link over for the address that got it right, and prunes rows a day old", async () => {
    await fail(db, key(1), 2, NOW - 25 * 60 * MINUTE);
    await fail(db, key(2), 3, NOW);
    await fail(db, key(0), 4, NOW);
    const right = await claimPasswordAttempt(db, key(0), NOW);
    if (!right.ok) throw new Error("refused");
    await releasePasswordClaim(db, key(0), right.attemptId, NOW);
    // Only link 2's failures are left: link 0's went with the right password, link 1's were old.
    const { rows } = await db.query<{ share_id: string }>(
      "SELECT share_id FROM squint_share_password_attempts",
    );
    expect(rows.map((row) => row.share_id)).toEqual(["s2", "s2", "s2"]);
    await fail(db, key(0), MAX_FAILURES_PER_LINK);
  });

  it("prunes rows a day old for the daily cleanup, with no right password needed", async () => {
    await fail(db, key(0), 2, NOW - 24 * 60 * MINUTE - 1);
    await fail(db, key(1), 1, NOW - 24 * 60 * MINUTE);
    await fail(db, key(2), 3, NOW);
    expect(await prunePasswordAttempts(db, NOW)).toBe(2);
    const { rows } = await db.query<{ share_id: string }>(
      "SELECT share_id FROM squint_share_password_attempts ORDER BY share_id",
    );
    expect(rows.map((row) => row.share_id)).toEqual(["s1", "s2", "s2", "s2"]);
    expect(await prunePasswordAttempts(db, NOW)).toBe(0);
  });

  it("stores an address only as an HMAC keyed from AUTH_SECRET", async () => {
    await fail(db, key(0, "198.51.100.7"), 1);
    const { rows } = await db.query<{ ip_hash: string }>(
      "SELECT ip_hash FROM squint_share_password_attempts",
    );
    expect(rows[0]?.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain("198.51.100.7");
    expect(addressKey("198.51.100.7", "another-secret-0123456789abcdef")).not.toBe(
      rows[0]?.ip_hash,
    );
  });
});

/**
 * Under real concurrency (PGlite runs one transaction at a time), in a schema
 * of its own in TEST_DATABASE_URL; skipped without it.
 */
describe.skipIf(!TEST_DATABASE_URL)("review link password limits in parallel", () => {
  let fresh: Awaited<ReturnType<typeof freshSchema>>;

  beforeAll(async () => {
    fresh = await freshSchema(TEST_DATABASE_URL as string, 12);
    await migrate(fresh.db);
    await addShares(fresh.db, 8);
  });

  afterAll(async () => {
    await fresh.close();
  });

  const allowed = (claims: Array<{ ok: boolean }>) => claims.filter((claim) => claim.ok).length;

  it("lets exactly 5 of 20 parallel guesses on one link from one address through", async () => {
    const claims = await Promise.all(
      Array.from({ length: 20 }, () => claimPasswordAttempt(fresh.db, key(0, "race-a"), NOW)),
    );
    expect(allowed(claims)).toBe(MAX_FAILURES_PER_LINK);
  });

  it("lets exactly 30 of 60 parallel guesses across 8 links from one address through", async () => {
    // 8 links would take 40 between them: the address's 30 is the limit that holds.
    const claims = await Promise.all(
      Array.from({ length: 60 }, (_, index) =>
        claimPasswordAttempt(fresh.db, key(index % 8, "race-b"), NOW),
      ),
    );
    expect(allowed(claims)).toBe(MAX_FAILURES_PER_ADDRESS);
  });
});
