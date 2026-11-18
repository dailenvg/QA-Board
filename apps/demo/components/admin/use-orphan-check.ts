"use client";

import { useCallback, useRef, useState } from "react";
import type { OrphanReport } from "@/lib/admin/orphans";
import { requestOrphanCheck, type StorageActionError } from "@/lib/admin/storage-client";

/** Where an orphan check stands: not asked for, on its way, answered, or failed. */
export type OrphanCheck =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ready"; report: OrphanReport }
  | { kind: "failed"; error: StorageActionError };

/**
 * An orphan check the admin starts (`check`), and its state. Only the latest
 * check's answer counts: one started again, or `reset`, sets aside an earlier
 * one still on its way.
 */
export function useOrphanCheck(initial: OrphanCheck = { kind: "idle" }) {
  const [state, setState] = useState<OrphanCheck>(initial);
  const latest = useRef(0);

  const check = useCallback(async () => {
    latest.current += 1;
    const mine = latest.current;
    setState({ kind: "checking" });
    const outcome = await requestOrphanCheck();
    if (mine !== latest.current) return;
    setState(
      outcome.ok
        ? { kind: "ready", report: outcome.value }
        : { kind: "failed", error: outcome.error },
    );
  }, []);

  const reset = useCallback(() => {
    latest.current += 1;
    setState({ kind: "idle" });
  }, []);

  return { state, check, reset };
}
