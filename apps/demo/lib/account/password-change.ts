import { hashPassword } from "../auth/password";
import { rotateSessions } from "../auth/sessions";
import type { SessionUser } from "../auth/users";
import type { Database } from "../db/database";
import { auditAccount } from "./audit";
import { checkCurrentPassword, type CurrentPasswordCheck } from "./current-password";

export interface PasswordChange {
  currentPassword: string;
  /** Already checked against the password rules (`passwordChangeSchema`). */
  newPassword: string;
  /** The caller's address, for the sign-in budget. */
  ip: string;
}

export type PasswordChangeResult =
  { ok: true; token: string } | Exclude<CurrentPasswordCheck, { ok: true }>;

/**
 * Changes the signed-in user's password once their current one checks out
 * (`checkCurrentPassword`). In one transaction: the new hash, every session
 * ended and a fresh one for this browser (`rotateSessions`, which also voids
 * unused reset links), and the audit entry. Returns the new session's token.
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
  const token = await db.transaction(async (tx) => {
    await tx.query("UPDATE users SET password_hash = $2 WHERE id = $1", [user.id, passwordHash]);
    await auditAccount(tx, user.id, "user.password_changed", ["password"], now);
    return rotateSessions(tx, user.id, now);
  });
  return { ok: true, token };
}
