import { useEffect, useState, useSyncExternalStore } from "react";
import { beginVisit, type Visit } from "./last-seen";

/** Each mounted Overview's visit, by a token of its own: gone with the component. */
const visits = new WeakMap<object, Visit & { workspaceId: string }>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * What counts as new on this look at the Overview (see `beginVisit`): null on
 * the server and in hydration, then the previous look's for as long as this
 * Overview stays on screen, so its marks don't vanish while it's read. Each
 * new look (coming back to the Overview, a reload) starts from the last.
 */
export function useVisit(workspaceId: string): Visit | null {
  const [token] = useState(() => ({}));

  useEffect(() => {
    // Once per look: a remount of the same component (StrictMode) keeps its visit.
    if (visits.get(token)?.workspaceId === workspaceId) return;
    visits.set(token, { workspaceId, ...beginVisit(workspaceId, Date.now()) });
    for (const listener of listeners) listener();
  }, [token, workspaceId]);

  return useSyncExternalStore(
    subscribe,
    () => {
      const visit = visits.get(token);
      return visit?.workspaceId === workspaceId ? visit : null;
    },
    () => null,
  );
}
