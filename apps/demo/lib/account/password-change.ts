import { startSession } from "../auth/better-auth";
import { hashPassword } from "../auth/password";
import type { SessionUser } from "../auth/users";
import type { Database } from "../db/database";
import { auditAccount } from "./audit";
import { checkCurrentPassword, type CurrentPasswordCheck } from "./current-password";
import { voidEmailChanges } from "./email-change";

export interface PasswordChange {
  currentPassword: string;
  /** Already checked against the password rules (`passwordChangeSchema`). */
  newPassword: string;
  /** The caller's address, for the sign-in budget. */
  ip: string;
}

/** `token`: the new session cookie's value, for the browser that made the change. */
export type PasswordChangeResult =
  { ok: true; token: string } | Exclude<CurrentPasswordCheck, { ok: true }>;

/**
 * Changes the signed-in user's password once their current one checks out
 * (`checkCurrentPassword`). In one transaction: the new hash, every session
 * of theirs ended, their unused reset links and pending email changes voided
 * (a link from before the change can't undo it or take the account), and the
 * audit entry. Once that commits, Better Auth starts a fresh session for this
 * browser, so it stays signed in.
 */
export async function changePassword(
  db: Database,
  user: SessionUser,
  { currentPassword, newPassword, ip }: PasswordChange,
  now: number,
): Promise<PasswordChangeResult> {
  const check = await checkCurrentPassword(db, user, currentPassword, ip, now);
  if (!check.ok) return check;
  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx.query("UPDATE users SET password_hash = $2 WHERE id = $1", [user.id, passwordHash]);
    await tx.query("DELETE FROM sessions WHERE user_id = $1", [user.id]);
    await tx.query(
      "UPDATE password_resets SET used_at = $2 WHERE user_id = $1 AND used_at IS NULL",
      [user.id, new Date(now)],
    );
    await voidEmailChanges(tx, user.id, now);
    await auditAccount(tx, user.id, "user.password_changed", ["password"], now);
  });
  return { ok: true, token: await startSession(db, user.id, now, { ip }) };
}
