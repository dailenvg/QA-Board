"use client";

import { AnimatePresence } from "motion/react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ancestorsOf, flattenFolderTree, type FolderNode } from "@/lib/store/folders";
import type { Folder } from "@/lib/store/types";
import type { MenuItem } from "../ui/Menu";
import { FolderTreeRow } from "./FolderTreeRow";
import { useExpandedFolders } from "./use-expanded-folders";

interface FolderTreeProps {
  folders: readonly Folder[];
  /** Projects in each folder, its subfolders' included. */
  counts: ReadonlyMap<string, number>;
  /** The folder whose page is open, if any. */
  activeId: string | null;
  /** Labelled by the sidebar's "Folders" heading. */
  labelledBy: string;
  /** The row menu's actions for a folder. */
  actionsFor: (folder: Folder) => MenuItem[];
}

/** Where the up and down arrows, Home and End go from row `index`; null for other keys. */
function moveIndex(key: string, index: number, count: number): number | null {
  switch (key) {
    case "ArrowDown":
      return Math.min(count - 1, index + 1);
    case "ArrowUp":
      return Math.max(0, index - 1);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/**
 * The sidebar's folders as a tree (WAI-ARIA tree pattern): one Tab stop; the
 * up and down arrows, Home and End move between visible folders; right opens a
 * folder or goes to its first subfolder; left closes it or goes to its parent;
 * Enter opens the folder's page. Open folders are remembered in this browser,
 * and the active folder's ancestors open to show it.
 */
export function FolderTree({ folders, counts, activeId, labelledBy, actionsFor }: FolderTreeProps) {
  const { expanded, setOpen } = useExpandedFolders();
  const ancestors = useMemo(
    () => new Set(activeId ? ancestorsOf(folders, activeId).map((folder) => folder.id) : []),
    [folders, activeId],
  );
  const rows = useMemo(
    () => flattenFolderTree(folders, (id) => expanded.has(id)),
    [folders, expanded],
  );
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const items = useRef(new Map<string, HTMLLIElement>());
  const moved = useRef(false);

  // Opening a folder's page opens the folders above it, so it shows in the tree.
  useEffect(() => {
    for (const id of ancestors) setOpen(id, true);
  }, [ancestors, setOpen]);

  // The one Tab stop: the row last moved to, else the active folder, else the first row.
  const tabStop =
    rows.find((row) => row.folder.id === focusedId)?.folder.id ??
    rows.find((row) => row.folder.id === activeId)?.folder.id ??
    rows[0]?.folder.id;

  useEffect(() => {
    if (!moved.current || !tabStop) return;
    moved.current = false;
    items.current.get(tabStop)?.focus();
  }, [tabStop]);

  const focusRow = (row: FolderNode | undefined) => {
    if (!row) return;
    moved.current = true;
    setFocusedId(row.folder.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    // Keys in an open row menu are the menu's own.
    if (!(event.target instanceof HTMLElement) || event.target.role !== "treeitem") return;
    const index = rows.findIndex((row) => row.folder.id === tabStop);
    const row = rows[index];
    if (!row) return;
    const next = moveIndex(event.key, index, rows.length);
    const open = expanded.has(row.folder.id);
    if (next !== null) {
      focusRow(rows[next]);
    } else if (event.key === "ArrowRight" && row.hasChildren) {
      if (open) focusRow(rows[index + 1]);
      else setOpen(row.folder.id, true);
    } else if (event.key === "ArrowLeft") {
      if (row.hasChildren && open) setOpen(row.folder.id, false);
      else focusRow(rows.find((entry) => entry.folder.id === row.folder.parentId));
    } else {
      return;
    }
    event.preventDefault();
  };

  const siblingsOf = (row: FolderNode) =>
    rows.filter((entry) => entry.folder.parentId === row.folder.parentId);

  return (
    <ul
      role="tree"
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      data-testid="folder-tree"
      className="-m-1 flex flex-col gap-1 p-1 max-lg:max-h-56 max-lg:overflow-y-auto"
    >
      <AnimatePresence initial={false}>
        {rows.map((row) => {
          const siblings = siblingsOf(row);
          return (
            <FolderTreeRow
              key={row.folder.id}
              node={row}
              count={counts.get(row.folder.id) ?? 0}
              open={expanded.has(row.folder.id)}
              active={row.folder.id === activeId}
              onPath={ancestors.has(row.folder.id)}
              tabbable={row.folder.id === tabStop}
              position={{ index: siblings.indexOf(row) + 1, size: siblings.length }}
              actions={actionsFor(row.folder)}
              itemRef={(element) => {
                if (element) items.current.set(row.folder.id, element);
                else items.current.delete(row.folder.id);
              }}
              onToggle={() => setOpen(row.folder.id, !expanded.has(row.folder.id))}
              onFocus={() => setFocusedId(row.folder.id)}
            />
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
