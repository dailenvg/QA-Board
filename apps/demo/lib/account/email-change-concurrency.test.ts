import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertUser } from "@/test/accounts-fixture";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { migrate } from "../share/migrate";
import { confirmEmailChange, requestEmailChange } from "./email-change";

/**
 * Email changes racing for one address. PGlite runs one transaction at a
 * time, so this needs a real Postgres (TEST_DATABASE_URL, local only); it
 * runs in a schema of its own and skips otherwise.
 */
describe.skipIf(!TEST_DATABASE_URL)("email changes on Postgres, in parallel", () => {
  let fresh: Awaited<ReturnType<typeof freshSchema>>;
  let db: Database;

  beforeAll(async () => {
    fresh = await freshSchema(TEST_DATABASE_URL as string, 8);
    db = fresh.db;
    await migrate(db);
  });

  afterAll(async () => {
    await fresh.close();
  });

  /** A change of a new user's address to `email`, and its link's token. */
  async function pending(name: string, email: string): Promise<string> {
    const userId = await insertUser(db, `${name}@acme.test`);
    let token = "";
    const result = await requestEmailChange(db, userId, email, {
      now: Date.now(),
      origin: new URL("https://squint.test"),
      send: ({ link }) => {
        token = link.split("/email-change/")[1] ?? "";
        return Promise.resolve();
      },
    });
    if (result.ok) await result.deliver();
    return token;
  }

  it("lets exactly one of several users confirm the same new address", async () => {
    const tokens = await Promise.all(
      ["ana", "bo", "cy", "di", "ed"].map((name) => pending(name, "wanted@acme.test")),
    );
    const now = Date.now();
    const results = await Promise.all(tokens.map((token) => confirmEmailChange(db, token, now)));
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual(
      Array(4).fill({ ok: false, reason: "taken" }),
    );
    const { rows } = await db.query("SELECT 1 FROM users WHERE email = 'wanted@acme.test'");
    expect(rows).toHaveLength(1);
  });

  it("confirms one link once, however many tabs post it", async () => {
    const token = await pending("fay", "fay.new@acme.test");
    const now = Date.now();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => confirmEmailChange(db, token, now)),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const { rows } = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM audit_log AS a JOIN users AS u ON u.id = a.actor_user_id
       WHERE a.action = 'user.email_changed' AND u.email = 'fay.new@acme.test'`,
    );
    expect(rows[0]?.count).toBe(1);
  });
});
