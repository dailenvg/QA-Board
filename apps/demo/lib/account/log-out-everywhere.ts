import { endUserSessions } from "../auth/better-auth";
import type { Database } from "../db/database";
import { auditAccount } from "./audit";
import { voidEmailChanges } from "./email-change";

/**
 * Log out everywhere: Better Auth ends every session of the user, this
 * browser's included; then, in one transaction, their pending email changes
 * are used up (one asked for from a session they just ended can't take the
 * account) and the audit log records it.
 */
export async function logOutEverywhere(db: Database, userId: string, now: number): Promise<void> {
  await endUserSessions(db, userId);
  await db.transaction(async (tx) => {
    await voidEmailChanges(tx, userId, now);
    await auditAccount(tx, userId, "user.signed_out_everywhere", ["sessions"], now);
  });
}
