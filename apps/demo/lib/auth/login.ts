import type { Database } from "../db/database";
import type { Queryable } from "../share/migrate";
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

/** `first`: the user had never signed in before. */
export type LoginResult =
  | { ok: true; token: string; user: SessionUser; first: boolean }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "rate-limited"; retryAfterSeconds: number };

/**
 * Stamps the user's sign-in and says whether it's their first, from the time
 * it replaces, in one statement. FOR UPDATE: of two sign-ins at once, the
 * second waits and reads the first one's time, so only one is the first.
 */
export async function recordLogin(db: Queryable, userId: string, now: number): Promise<boolean> {
  const { rows } = await db.query<{ previous: Date | null }>(
    `WITH previous AS (SELECT id, last_login_at FROM users WHERE id = $1 FOR UPDATE)
     UPDATE users SET last_login_at = $2 FROM previous WHERE users.id = previous.id
     RETURNING previous.last_login_at AS previous`,
    [userId, new Date(now)],
  );
  return rows[0]?.previous == null;
}

/**
 * Signs in with email and password. The attempt is claimed against the rate
 * limit first, atomically, so parallel requests can't slip past it (even a
 * right password waits out the limit). An unknown email and a wrong password
 * take the same work (the dummy hash) and give the same answer, `invalid`; the
 * claim then stays as a failure. A success releases it, and says whether it
 * was the user's first sign-in.
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
  const first = await recordLogin(db, user.id, now);
  const token = await createSession(db, user.id, now);
  return { ok: true, token, user: toSessionUser(user), first };
}
