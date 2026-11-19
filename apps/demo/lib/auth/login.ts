import { isAPIError } from "better-auth/api";
import { auditAccount } from "../account/audit";
import type { Database } from "../db/database";
import type { Queryable } from "../share/migrate";
import { authSecret } from "./auth-secret";
import { signInWithPassword } from "./better-auth";
import { normalizeEmail } from "./field-rules";
import { claimLoginAttempt, releaseLoginClaim } from "./rate-limit";
import { signSessionToken } from "./session-token";
import { holdOf } from "./sign-in-hold";
import type { SessionUser } from "./users";

export interface LoginAttempt {
  email: string;
  password: string;
  /** The caller's address, for the per-IP limit. */
  ip: string;
  /** The caller's browser, kept with the session. */
  userAgent?: string | null;
}

/** `first`: the user had never signed in before. `token`: the session cookie's value. */
export type LoginResult =
  | { ok: true; token: string; user: SessionUser; first: boolean }
  | { ok: false; reason: "invalid" }
  /** The right password, on an account removed from its workspace in the last 24 hours. */
  | { ok: false; reason: "removed" }
  /** The right password, on an account whose only workspaces are closed, one suspended. */
  | { ok: false; reason: "suspended" }
  | { ok: false; reason: "rate-limited"; retryAfterSeconds: number };

type Refusal = Extract<LoginResult, { reason: "invalid" | "removed" | "suspended" }>;

/**
 * Better Auth's answers that mean "wrong email or password": no such account
 * (or a malformed email) and a wrong or over-long password. Each is the same
 * `invalid`, so none says which emails have accounts.
 */
const INVALID_CODES = new Set([
  "INVALID_EMAIL_OR_PASSWORD",
  "INVALID_EMAIL",
  "PASSWORD_TOO_LONG",
  "PASSWORD_TOO_SHORT",
]);

/** The refusal Better Auth's `error` means, or null for a failure (storage, a bug) to throw on. */
function refusalOf(error: unknown): Refusal | null {
  const hold = holdOf(error);
  if (hold === "removed" || hold === "suspended") return { ok: false, reason: hold };
  if (hold === "gone") return { ok: false, reason: "invalid" };
  const code = isAPIError(error) ? (error.body as { code?: unknown } | undefined)?.code : null;
  return typeof code === "string" && INVALID_CODES.has(code)
    ? { ok: false, reason: "invalid" }
    : null;
}

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

/** Clears the user's expired sessions, as each new one starts. */
async function clearExpiredSessions(db: Queryable, userId: string, now: number): Promise<void> {
  await db.query("DELETE FROM sessions WHERE user_id = $1 AND expires_at <= $2", [
    userId,
    new Date(now),
  ]);
}

/**
 * Signs in with email and password. The attempt is claimed against the rate
 * limit first, atomically, so parallel requests can't slip past it (even a
 * right password waits out the limit). Better Auth then checks the password:
 * an unknown email and a wrong password take the same work (it hashes the
 * password given) and give the same answer, `invalid`; the claim then stays
 * as a failure. The right password on an account removed from its workspace
 * less than 24 hours ago answers `removed`, with no session (the sign-in
 * hold), and keeps the claim too, so the limit also caps how often a password
 * can be confirmed that way (decision 20). The right password on an account
 * held by a suspension answers `suspended` the same way: no session, the
 * claim kept. A success releases it, is written to the audit log, and says
 * whether it was the user's first sign-in.
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

  let session: Awaited<ReturnType<typeof signInWithPassword>>;
  try {
    session = await signInWithPassword(
      db,
      { email: key.email, password: attempt.password },
      { ip: attempt.ip, userAgent: attempt.userAgent },
      now,
    );
  } catch (error) {
    const refusal = refusalOf(error);
    if (refusal) return refusal;
    throw error;
  }
  const { token, user } = session;

  await releaseLoginClaim(db, key.email, claim.attemptId, now);
  const first = await recordLogin(db, user.id, now);
  await clearExpiredSessions(db, user.id, now);
  await auditAccount(db, user.id, "user.signed_in", [], now);
  return { ok: true, token: signSessionToken(token, authSecret()), user, first };
}
