"use client";

import { useEffect, useState } from "react";
import { planRevocations, REVOKE_RETRY_MS, revokeNow } from "@/lib/share-client/revocations";
import { useSquint } from "@/lib/store/use-squint";

/**
 * Revokes the share links of deleted projects once each delete is final, and
 * keeps retrying any that fail while Squint is open (and on the next load).
 * Renders nothing.
 */
export function Revocations() {
  const state = useSquint();
  const entries = state.status === "ready" ? state.data.revocations : null;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!entries?.length) return;
    const now = Date.now();
    const { due, nextAt } = planRevocations(entries, now);
    for (const entry of due) void revokeNow(entry);
    const wait = due.length ? REVOKE_RETRY_MS : (nextAt ?? now) - now;
    const timer = setTimeout(() => setTick((value) => value + 1), Math.max(0, wait));
    return () => clearTimeout(timer);
  }, [entries, tick]);

  return null;
}
