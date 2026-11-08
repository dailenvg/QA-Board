import type { Database } from "../db/database";
import { auditAccount } from "./audit";

/** Sets the user's name (already checked by `profileSchema`) and records that it changed. */
export function updateDisplayName(
  db: Database,
  userId: string,
  name: string,
  now: number,
): Promise<void> {
  return db.transaction(async (tx) => {
    await tx.query("UPDATE users SET name = $2 WHERE id = $1 AND deleted_at IS NULL", [
      userId,
      name,
    ]);
    await auditAccount(tx, userId, "user.name_changed", ["name"], now);
  });
}
