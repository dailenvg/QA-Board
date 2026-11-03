import { describe, expect, it } from "vitest";
import { insertUser, NOW, PASSWORD } from "@/test/accounts-fixture";
import { migratedPglite } from "@/test/pglite";
import type { Queryable } from "../share/migrate";
import { logIn } from "./login";
import {
  completePasswordReset,
  isResetTokenUsable,
  MAX_RESETS_PER_HOUR,
  requestPasswordReset,
  RESET_TTL_MS,
  type ResetEmail,
} from "./password-reset";
import { createSession, readSession } from "./sessions";

const ORIGIN = new URL("https://squint.test");
const NEW_PASSWORD = "a brand new password";

/** Requests a reset at `now` and returns the emails sent. */
async function request(db: Queryable, email: string, now = NOW): Promise<ResetEmail[]> {
  const sent: ResetEmail[] = [];
  await requestPasswordReset(db, email, {
    now,
    origin: ORIGIN,
    send: (message) => {
      sent.push(message);
      return Promise.resolve();
    },
  });
  return sent;
}

function tokenOf(email: ResetEmail | undefined): string {
  const token = email?.link.split("/reset/")[1];
  if (!token) throw new Error("no link");
  return token;
}

describe("password reset", () => {
  it("emails a one-hour link to the account, storing only its hash", async () => {
    const db = await migratedPglite();
    await insertUser(db, "ana@acme.test");
    const [email] = await request(db, " ANA@acme.test ");
    expect(email?.to).toBe("ana@acme.test");
    expect(email?.link).toMatch(/^https:\/\/squint\.test\/reset\/[A-Za-z0-9_-]{43}$/);
    const token = tokenOf(email);
    const { rows } = await db.query<{ token_hash: string }>(
      "SELECT token_hash FROM password_resets",
    );
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(await isResetTokenUsable(db, token, NOW + RESET_TTL_MS - 1)).toBe(true);
    expect(await isResetTokenUsable(db, token, NOW + RESET_TTL_MS)).toBe(false);
  });

  it("sends nothing for unknown or deleted accounts", async () => {
    const db = await migratedPglite();
    await insertUser(db, "gone@acme.test");
    await db.query("UPDATE users SET deleted_at = now()");
    expect(await request(db, "nobody@acme.test")).toEqual([]);
    expect(await request(db, "gone@acme.test")).toEqual([]);
  });

  it("sends at most 3 links an hour per account", async () => {
    const db = await migratedPglite();
    await insertUser(db, "ana@acme.test");
    for (let index = 0; index < MAX_RESETS_PER_HOUR; index += 1) {
      expect(await request(db, "ana@acme.test", NOW + index)).toHaveLength(1);
    }
    expect(await request(db, "ana@acme.test", NOW + 10)).toEqual([]);
    expect(await request(db, "ana@acme.test", NOW + RESET_TTL_MS + 1)).toHaveLength(1);
  });

  it("sets the password once, ends every session and spends the other links", async () => {
    const db = await migratedPglite();
    const userId = await insertUser(db, "ana@acme.test");
    const session = await createSession(db, userId, NOW);
    const [first] = await request(db, "ana@acme.test");
    const [second] = await request(db, "ana@acme.test");

    expect(await completePasswordReset(db, tokenOf(first), NEW_PASSWORD, NOW + 1)).toBe(true);
    expect(await completePasswordReset(db, tokenOf(first), "another password!", NOW + 2)).toBe(
      false,
    );
    expect(await isResetTokenUsable(db, tokenOf(second), NOW + 2)).toBe(false);
    expect(await readSession(db, session, NOW + 2)).toBeNull();

    const ip = "203.0.113.9";
    expect(
      await logIn(db, { email: "ana@acme.test", password: PASSWORD, ip }, NOW + 3),
    ).toMatchObject({ ok: false });
    expect(
      await logIn(db, { email: "ana@acme.test", password: NEW_PASSWORD, ip }, NOW + 4),
    ).toMatchObject({ ok: true });
    const { rows } = await db.query<{ action: string }>("SELECT action FROM audit_log");
    expect(rows).toEqual([{ action: "user.password_reset" }]);
  });

  it("refuses expired and made-up links", async () => {
    const db = await migratedPglite();
    await insertUser(db, "ana@acme.test");
    const [email] = await request(db, "ana@acme.test");
    expect(await completePasswordReset(db, tokenOf(email), NEW_PASSWORD, NOW + RESET_TTL_MS)).toBe(
      false,
    );
    expect(await completePasswordReset(db, "x".repeat(43), NEW_PASSWORD, NOW)).toBe(false);
    expect(await completePasswordReset(db, "../etc", NEW_PASSWORD, NOW)).toBe(false);
  });
});
