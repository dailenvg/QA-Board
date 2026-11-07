import { useSyncExternalStore } from "react";

/** Which sidebar folders are open, remembered in this browser apart from the workspace data. */
const KEY = "squint:folder-tree";

const NONE: ReadonlySet<string> = new Set();

function readExpanded(): ReadonlySet<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return new Set(
      Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [],
    );
  } catch {
    return new Set();
  }
}

/** This tab's open folders, read from storage on first use in the browser. */
let expanded: ReadonlySet<string> | null = null;
const listeners = new Set<() => void>();

const snapshot = (): ReadonlySet<string> => (expanded ??= readExpanded());
const serverSnapshot = (): ReadonlySet<string> => NONE;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setOpen(folderId: string, open: boolean): void {
  const current = snapshot();
  if (current.has(folderId) === open) return;
  const next = new Set(current);
  if (open) next.add(folderId);
  else next.delete(folderId);
  expanded = next;
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]));
  } catch {
    // Not remembered; the tree still works for this visit.
  }
  for (const listener of listeners) listener();
}

/**
 * The sidebar tree's open folders, kept across visits. None on the server
 * and in hydration (the sidebar renders there too), the remembered ones
 * right after.
 */
export function useExpandedFolders() {
  return { expanded: useSyncExternalStore(subscribe, snapshot, serverSnapshot), setOpen };
}
