import type { Queryable } from "../share/migrate";
import { normalizeEmail } from "./field-rules";
import { verifyPassword } from "./password";
import { checkLoginLimit, clearLoginFailures, recordLoginFailure } from "./rate-limit";
import { createSession } from "./sessions";
import { findActiveUser, toSessionUser, type SessionUser } from "./users";

export interface LoginAttempt {
  email: string;
  password: string;
  /** The caller's address, for the per-IP limit. */
  ip: string;
}

export type LoginResult =
  | { ok: true; token: string; user: SessionUser }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "rate-limited"; retryAfterSeconds: number };

/**
 * Signs in with email and password. Rate-limited first (even a right password
 * waits out the limit). An unknown email and a wrong password take the same
 * work and give the same answer, `invalid`, and both count as failures.
 */
export async function logIn(
  db: Queryable,
  attempt: LoginAttempt,
  now: number,
): Promise<LoginResult> {
  const key = { email: normalizeEmail(attempt.email), ip: attempt.ip };
  const limit = await checkLoginLimit(db, key, now);
  if (!limit.ok)
    return { ok: false, reason: "rate-limited", retryAfterSeconds: limit.retryAfterSeconds };

  const user = await findActiveUser(db, key.email);
  const matches = await verifyPassword(attempt.password, user?.password_hash ?? null);
  if (!user || !matches) {
    await recordLoginFailure(db, key, now);
    return { ok: false, reason: "invalid" };
  }

  await clearLoginFailures(db, key.email, now);
  await db.query("UPDATE users SET last_login_at = $2 WHERE id = $1", [user.id, new Date(now)]);
  const token = await createSession(db, user.id, now);
  return { ok: true, token, user: toSessionUser(user) };
}
