import type { Database } from "../db/database";
import { normalizeEmail } from "./field-rules";
import { verifyPassword } from "./password";
import { claimLoginAttempt, releaseLoginClaim } from "./rate-limit";
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
 * Signs in with email and password. The attempt is claimed against the rate
 * limit first, atomically, so parallel requests can't slip past it (even a
 * right password waits out the limit). An unknown email and a wrong password
 * take the same work (the dummy hash) and give the same answer, `invalid`; the
 * claim then stays as a failure. A success releases it.
 */
export async function logIn(
  db: Database,
  attempt: LoginAttempt,
  now: number,
): Promise<LoginResult> {
  const key = { email: normalizeEmail(attempt.email), ip: attempt.ip };
  const claim = await claimLoginAttempt(db, key, now);
  if (!claim.ok) {
    return { ok: false, reason: "rate-limited", retryAfterSeconds: claim.retryAfterSeconds };
  }

  const user = await findActiveUser(db, key.email);
  const matches = await verifyPassword(attempt.password, user?.password_hash ?? null);
  if (!user || !matches) return { ok: false, reason: "invalid" };

  await releaseLoginClaim(db, key.email, claim.attemptId, now);
  await db.query("UPDATE users SET last_login_at = $2 WHERE id = $1", [user.id, new Date(now)]);
  const token = await createSession(db, user.id, now);
  return { ok: true, token, user: toSessionUser(user) };
}
