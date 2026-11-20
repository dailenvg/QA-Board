import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertUser } from "@/test/accounts-fixture";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { migrate } from "../share/migrate";
import { requestPasswordReset } from "./password-reset";
import { handleResetComplete } from "./reset-complete-handler";

/**
 * Reset links of one user used at once. PGlite runs one transaction at a
 * time, so this needs a real Postgres (TEST_DATABASE_URL, local only); it
 * runs in a schema of its own and skips otherwise.
 */

const ROUNDS = 10;
const NEW_PASSWORD = "a brand new password";

describe.skipIf(!TEST_DATABASE_URL)("password resets on Postgres, in parallel", () => {
  let fresh: Awaited<ReturnType<typeof freshSchema>>;
  let db: Database;
  let users = 0;

  beforeAll(async () => {
    fresh = await freshSchema(TEST_DATABASE_URL as string, 8);
    db = fresh.db;
    await migrate(db);
  });

  afterAll(async () => {
    await fresh.close();
  });

  /** A new user with `count` emailed links; their tokens. */
  async function linksOfNewUser(count: number): Promise<string[]> {
    const email = `user-${(users += 1)}@acme.test`;
    await insertUser(db, email);
    const tokens: string[] = [];
    for (let index = 0; index < count; index += 1) {
      await requestPasswordReset(db, email, {
        now: Date.now(),
        origin: new URL("https://squint.test"),
        send: ({ link }) => {
          tokens.push(link.split("/reset/")[1] ?? "");
          return Promise.resolve();
        },
      });
    }
    return tokens;
  }

  /** Posts `token` to the reset route as the hydrated form does; its status and body. */
  async function complete(token: string) {
    const response = await handleResetComplete(
      new NextRequest("http://127.0.0.1:3100/api/auth/reset/complete", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.30" },
        body: JSON.stringify({ token, password: NEW_PASSWORD }),
      }),
      { db: Promise.resolve(db), now: Date.now() },
    );
    return { status: response.status, body: (await response.json()) as unknown };
  }

  /** The two answers, the success first. */
  function sorted(answers: Array<{ status: number; body: unknown }>) {
    return [...answers].sort((a, b) => a.status - b.status);
  }

  it("takes one of two different links sent at once; the other has expired, every round", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const tokens = await linksOfNewUser(2);
      const answers = await Promise.all(tokens.map(complete));
      expect(sorted(answers)).toEqual([
        { status: 200, body: { ok: true } },
        { status: 410, body: { error: "expired" } },
      ]);
    }
  });

  it("takes one link once, however many tabs post it", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const [token = ""] = await linksOfNewUser(1);
      const answers = await Promise.all([complete(token), complete(token)]);
      expect(sorted(answers)).toEqual([
        { status: 200, body: { ok: true } },
        { status: 410, body: { error: "expired" } },
      ]);
    }
  });
});
