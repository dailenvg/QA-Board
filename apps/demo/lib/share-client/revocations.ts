import { revocationDone } from "../store/actions";
import type { PendingRevocation } from "../store/types";
import { ownerApi } from "./api";

/** How often failed revokes are retried while Squint is open (and on every load). */
export const REVOKE_RETRY_MS = 30_000;

const inFlight = new Set<string>();

/** Entries due now, and when the next one falls due (null when none is waiting). */
export function planRevocations(
  entries: readonly PendingRevocation[],
  now: number,
): { due: PendingRevocation[]; nextAt: number | null } {
  const due = entries.filter((entry) => entry.dueAt <= now);
  const waiting = entries.filter((entry) => entry.dueAt > now).map((entry) => entry.dueAt);
  return { due, nextAt: waiting.length ? Math.min(...waiting) : null };
}

/**
 * Revokes one deleted project's share. Done when the server confirms, or says
 * it no longer has it; otherwise the entry stays and is tried again later.
 */
export async function revokeNow(entry: PendingRevocation): Promise<void> {
  if (inFlight.has(entry.shareId)) return;
  inFlight.add(entry.shareId);
  try {
    const result = await ownerApi.revoke({ id: entry.shareId, ownerKey: entry.ownerKey });
    if (result.ok || result.status === 404) revocationDone(entry.shareId);
  } finally {
    inFlight.delete(entry.shareId);
  }
}
