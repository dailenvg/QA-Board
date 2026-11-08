import { describe, expect, it } from "vitest";
import { insertUser, NOW, PASSWORD } from "@/test/accounts-fixture";
import { migratedPglite } from "@/test/pglite";
import { verifyPassword } from "../auth/password";
import { MAX_FAILURES_PER_EMAIL } from "../auth/rate-limit";
import { createSession, readSession } from "../auth/sessions";
import type { SessionUser } from "../auth/users";
import type { Database } from "../db/database";
import { changePassword } from "./password-change";

const NEW_PASSWORD = "a brand new password";
const IP = "203.0.113.5";

async function setup(): Promise<{ db: Database; user: SessionUser }> {
  const db = await migratedPglite();
  const id = await insertUser(db, "ana@acme.test");
  return { db, user: { id, email: "ana@acme.test", name: null, role: "company" } };
}

async function attempts(db: Database): Promise<Array<{ email: string; ip: string }>> {
  const { rows } = await db.query<{ email: string; ip: string }>(
    "SELECT email, ip FROM login_attempts ORDER BY id",
  );
  return rows;
}

async function storedHash(db: Database, id: string): Promise<string> {
  const { rows } = await db.query<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE id = $1",
    [id],
  );
  return rows[0]?.password_hash ?? "";
}

describe("changing the password", () => {
  it("claims a sign-in attempt for a wrong current password, keyed on the email and address", async () => {
    const { db, user } = await setup();
    const before = await storedHash(db, user.id);
    const result = await changePassword(
      db,
      user,
      { currentPassword: "not my password", newPassword: NEW_PASSWORD, ip: IP },
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: "wrong-password" });
    expect(await attempts(db)).toEqual([{ email: "ana@acme.test", ip: IP }]);
    expect(await storedHash(db, user.id)).toBe(before);
  });

  it("shares the sign-in budget: past it, even the right password waits", async () => {
    const { db, user } = await setup();
    for (let index = 0; index < MAX_FAILURES_PER_EMAIL; index += 1) {
      await changePassword(
        db,
        user,
        { currentPassword: "wrong", newPassword: NEW_PASSWORD, ip: `198.51.100.${index}` },
        NOW,
      );
    }
    const result = await changePassword(
      db,
      user,
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, ip: IP },
      NOW,
    );
    expect(result).toMatchObject({ ok: false, reason: "rate-limited" });
    expect(await verifyPassword(PASSWORD, await storedHash(db, user.id))).toBe(true);
  });

  it("rotates the sessions on success: a new one for this browser, none elsewhere", async () => {
    const { db, user } = await setup();
    const laptop = await createSession(db, user.id, NOW);
    const phone = await createSession(db, user.id, NOW);
    await db.query(
      "INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
      [user.id, "c".repeat(64), new Date(NOW + 1000)],
    );
    const result = await changePassword(
      db,
      user,
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, ip: IP },
      NOW,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(await readSession(db, laptop, NOW)).toBeNull();
    expect(await readSession(db, phone, NOW)).toBeNull();
    expect(await readSession(db, result.token, NOW)).toMatchObject({ id: user.id });
    expect(await verifyPassword(NEW_PASSWORD, await storedHash(db, user.id))).toBe(true);
    // The claim is released, and a reset link mailed before the change can't undo it.
    expect(await attempts(db)).toEqual([]);
    const { rows } = await db.query("SELECT 1 FROM password_resets WHERE used_at IS NULL");
    expect(rows).toEqual([]);
    const { rows: audit } = await db.query("SELECT action, meta FROM audit_log");
    expect(audit).toEqual([{ action: "user.password_changed", meta: { fields: ["password"] } }]);
  });
});
