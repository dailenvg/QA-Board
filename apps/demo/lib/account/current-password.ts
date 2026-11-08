import { normalizeEmail } from "../auth/field-rules";
import { verifyPassword } from "../auth/password";
import { claimLoginAttempt, releaseLoginClaim } from "../auth/rate-limit";
import type { SessionUser } from "../auth/users";
import type { Database } from "../db/database";

export type CurrentPasswordCheck =
  | { ok: true }
  | { ok: false; reason: "wrong-password" }
  | { ok: false; reason: "rate-limited"; retryAfterSeconds: number };

/**
 * Checks the password a signed-in user typed to change their account, against
 * the sign-in budget: the attempt is claimed first, keyed on their email and
 * `ip` like a sign-in (`claimLoginAttempt`), so a stolen session can't guess
 * the password any faster than the login form could. A wrong one stays as a
 * failure; a right one releases the claim, as signing in does.
 */
export async function checkCurrentPassword(
  db: Database,
  user: SessionUser,
  password: string,
  ip: string,
  now: number,
): Promise<CurrentPasswordCheck> {
  const email = normalizeEmail(user.email);
  const claim = await claimLoginAttempt(db, { email, ip }, now);
  if (!claim.ok) {
    return { ok: false, reason: "rate-limited", retryAfterSeconds: claim.retryAfterSeconds };
  }
  const { rows } = await db.query<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL",
    [user.id],
  );
  const matches = await verifyPassword(password, rows[0]?.password_hash ?? null);
  if (!matches) return { ok: false, reason: "wrong-password" };
  await releaseLoginClaim(db, email, claim.attemptId, now);
  return { ok: true };
}
