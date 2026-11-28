import type { Queryable } from "./migrate";

/**
 * Takes the per-share lock for the rest of the transaction `tx` runs (B4): an
 * owner's push (`applyChanges`), attaching the share to a project, and making
 * a comment or reply team only all take it first, before any row lock, so
 * they run one at a time. Whichever goes second sees what the first wrote, so
 * a stale push can never put back a comment that has just gone team only.
 * Guests' posts don't take it.
 */
export async function lockShare(tx: Queryable, shareId: string): Promise<void> {
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('squint:share:' || $1, 0))", [
    shareId,
  ]);
}
