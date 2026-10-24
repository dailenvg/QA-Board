import { useEffect, useSyncExternalStore } from "react";
import type { Project } from "../store/types";
import { pullNow, pushNow, subscribeSync, syncStatus, type SyncStatus } from "./owner-sync";

/** Owner changes go out shortly after they're made (several quick ones become one push). */
const PUSH_DEBOUNCE_MS = 400;
/** Client comments are pulled this often while the tab is visible, and on focus. */
export const PULL_INTERVAL_MS = 15_000;

const SERVER_STATUS: SyncStatus = { phase: "idle", checkedAt: null, uploading: null };

/**
 * Keeps a shared project in sync while its viewer is open: pushes whenever
 * `payload` (the owner's state, serialized) changes, and pulls client
 * additions on open, every 15 seconds while visible, and on focus.
 */
export function useShareSync(project: Project, payload: string | null): SyncStatus {
  const shared = Boolean(project.share);
  const id = project.id;
  const status = useSyncExternalStore(
    (listener) => subscribeSync(id, listener),
    () => syncStatus(id),
    () => SERVER_STATUS,
  );

  useEffect(() => {
    if (!shared || payload === null) return;
    const timer = setTimeout(() => void pushNow(id), PUSH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [shared, payload, id]);

  useEffect(() => {
    if (!shared) return;
    const pull = () => {
      if (document.visibilityState === "visible") void pullNow(id);
    };
    pull();
    const timer = setInterval(pull, PULL_INTERVAL_MS);
    window.addEventListener("focus", pull);
    document.addEventListener("visibilitychange", pull);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", pull);
      document.removeEventListener("visibilitychange", pull);
    };
  }, [shared, id]);

  return status;
}
