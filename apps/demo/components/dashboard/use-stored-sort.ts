import { useCallback, useMemo, useSyncExternalStore } from "react";
import { parseSortChoice, type SortChoice, type SortOptions } from "./sort-choice";

export interface StoredSort<Key extends string> {
  sort: SortChoice<Key>;
  /** Picking a new key starts it in that key's natural direction. */
  setKey: (key: Key) => void;
  reverse: () => void;
}

const serverSnapshot = (): string | null => null;

/**
 * A hook for one list's sort order, remembered in this browser under
 * `storageKey`, apart from the workspace data. It gives the default on the
 * server and in the first client render, so hydration always matches, and
 * follows changes from this tab and others.
 */
export function createStoredSort<Key extends string>(
  storageKey: string,
  options: SortOptions<Key>,
): () => StoredSort<Key> {
  const changeEvent = `${storageKey}-change`;
  /** This visit's latest choice, so it still applies when storage is blocked. */
  let written: string | null | undefined;

  const readRaw = (): string | null => {
    if (written !== undefined) return written;
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  };

  const write = (sort: SortChoice<Key>): void => {
    written = JSON.stringify(sort);
    try {
      localStorage.setItem(storageKey, written);
    } catch {
      // Not remembered; the order still applies for this visit.
    }
    window.dispatchEvent(new Event(changeEvent));
  };

  const subscribe = (onChange: () => void): (() => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      written = event.newValue;
      onChange();
    };
    window.addEventListener(changeEvent, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(changeEvent, onChange);
      window.removeEventListener("storage", onStorage);
    };
  };

  return function useStoredSort(): StoredSort<Key> {
    const raw = useSyncExternalStore(subscribe, readRaw, serverSnapshot);
    const sort = useMemo(() => parseSortChoice(raw, options), [raw]);

    const setKey = useCallback(
      (key: Key) => {
        if (key !== sort.key) write({ key, direction: options.specs[key].natural });
      },
      [sort.key],
    );

    const reverse = useCallback(
      () => write({ ...sort, direction: sort.direction === "asc" ? "desc" : "asc" }),
      [sort],
    );

    return { sort, setKey, reverse };
  };
}
