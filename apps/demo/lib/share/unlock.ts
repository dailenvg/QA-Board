import { verifyPassword } from "../auth/password";
import type { Database } from "../db/database";
import { issueGuestPass, type GuestPass } from "./guest-pass";
import { addressKey, claimPasswordAttempt, releasePasswordClaim } from "./password-attempts";
import type { ShareRecord } from "./types";

export type UnlockResult =
  /** `pass` is null for a link without a password: there's nothing to unlock. */
  | { ok: true; pass: GuestPass | null }
  | { ok: false; reason: "wrong-password" }
  | { ok: false; reason: "rate-limited"; retryAfterSeconds: number };

/**
 * A guest's try at a protected link's password, from address `ip`. The try is
 * claimed against the rate limit before Argon2 runs (even the right password
 * waits the limit out); a wrong one stays counted; the right one is released
 * and earns a guest pass for the password as it stands. A link without a
 * password answers ok with no pass, and counts nothing.
 */
export async function unlockShare(
  db: () => Promise<Database>,
  share: ShareRecord,
  attempt: { password: string; ip: string },
  now: number,
): Promise<UnlockResult> {
  const { password } = share;
  if (!password) return { ok: true, pass: null };
  const database = await db();
  const key = { shareId: share.id, ipHash: addressKey(attempt.ip) };
  const claim = await claimPasswordAttempt(database, key, now);
  if (!claim.ok) {
    return { ok: false, reason: "rate-limited", retryAfterSeconds: claim.retryAfterSeconds };
  }
  if (!(await verifyPassword(attempt.password, password.hash))) {
    return { ok: false, reason: "wrong-password" };
  }
  await releasePasswordClaim(database, key, claim.attemptId, now);
  return { ok: true, pass: issueGuestPass({ id: share.id, password }, now) };
}
