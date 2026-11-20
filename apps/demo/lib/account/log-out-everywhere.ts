import type { Database } from "../db/database";
import { auditAccount } from "./audit";
import { voidEmailChanges } from "./email-change";

/**
 * Log out everywhere, in one transaction: every session of the user ends,
 * this browser's included, and their pending email changes are used up (one
 * asked for from a session they just ended can't take the account), and the
 * audit log records it. All or nothing: a failure leaves every session and
 * email change as it was, so the user can try again. The sessions go in SQL
 * on Better Auth's `sessions` table, as a password change ends them.
 */
export function logOutEverywhere(db: Database, userId: string, now: number): Promise<void> {
  return db.transaction(async (tx) => {
    await tx.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await voidEmailChanges(tx, userId, now);
    await auditAccount(tx, userId, "user.signed_out_everywhere", ["sessions"], now);
  });
}
