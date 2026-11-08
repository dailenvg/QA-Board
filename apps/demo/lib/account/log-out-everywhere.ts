import { deleteUserSessions } from "../auth/sessions";
import type { Database } from "../db/database";
import { auditAccount } from "./audit";
import { voidEmailChanges } from "./email-change";

/**
 * Log out everywhere, in one transaction: every session of the user ends,
 * this browser's included, and their pending email changes are used up (one
 * asked for from a session they just ended can't take the account), and the
 * audit log records it.
 */
export function logOutEverywhere(db: Database, userId: string, now: number): Promise<void> {
  return db.transaction(async (tx) => {
    await deleteUserSessions(tx, userId);
    await voidEmailChanges(tx, userId, now);
    await auditAccount(tx, userId, "user.signed_out_everywhere", ["sessions"], now);
  });
}
