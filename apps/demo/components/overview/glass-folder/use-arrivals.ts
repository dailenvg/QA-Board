import { useCallback, useState } from "react";

export interface Arrivals {
  /** The newly arrived id that is dropping in right now, if any. */
  dropping: string | null;
  /** Counts arrivals; key the pocket's bump animation on it to replay it. */
  bump: number;
  /** Call when the drop animation ends. */
  settle: () => void;
}

/**
 * Spots ids that weren't in the list before, so only a newly added file
 * animates in. Ids present on mount count as already there. `ids` is newest
 * first; when several arrive at once, the newest one drops.
 */
export function useArrivals(ids: readonly string[]): Arrivals {
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set(ids));
  const [dropping, setDropping] = useState<string | null>(null);
  const [bump, setBump] = useState(0);

  // Adjusting state while rendering (React's pattern for reacting to new props):
  // it settles in the same pass, so the drop never starts a frame late.
  const fresh = ids.filter((id) => !seen.has(id));
  if (fresh.length > 0) {
    setSeen(new Set([...seen, ...fresh]));
    setDropping(fresh[0] ?? null);
    setBump((count) => count + 1);
  }

  const settle = useCallback(() => setDropping(null), []);
  return { dropping, bump, settle };
}
