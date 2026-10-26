import { useCallback, useMemo, useSyncExternalStore } from "react";
import { SORT_SPECS, parseSort, type ProjectSort, type SortKey } from "./project-sort";

/** One choice for every folder page, remembered in this browser apart from the workspace data. */
const KEY = "squint:project-sort";
const EVENT = "squint:project-sort-change";

/** This visit's latest choice, so it still applies when storage is blocked. */
let written: string | null | undefined;

function readRaw(): string | null {
  if (written !== undefined) return written;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function writeSort(sort: ProjectSort): void {
  written = JSON.stringify(sort);
  try {
    localStorage.setItem(KEY, written);
  } catch {
    // Not remembered; the order still applies for this visit.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** This tab's changes plus other tabs'. */
function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    written = event.newValue;
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const serverSnapshot = (): string | null => null;

/**
 * The folder pages' project order, kept across visits. The default on the
 * server and in the first client render, so hydration always matches.
 * Picking a new key starts it in that key's natural direction.
 */
export function useProjectSort() {
  const raw = useSyncExternalStore(subscribe, readRaw, serverSnapshot);
  const sort = useMemo(() => parseSort(raw), [raw]);

  const setKey = useCallback(
    (key: SortKey) => {
      if (key !== sort.key) writeSort({ key, direction: SORT_SPECS[key].natural });
    },
    [sort.key],
  );

  const reverse = useCallback(
    () => writeSort({ ...sort, direction: sort.direction === "asc" ? "desc" : "asc" }),
    [sort],
  );

  return { sort, setKey, reverse };
}
