"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { duration, ease, instant, spring } from "@/lib/motion";
import { FOLDERS_HREF, OVERVIEW_HREF } from "@/lib/routes";
import type { Folder } from "@/lib/store/types";
import { Icon } from "../ui/Icon";
import type { MenuItem } from "../ui/Menu";
import { FolderTree } from "./FolderTree";
import { NavRow } from "./NavRow";
import { useFoldersOpen } from "./use-folders-open";

interface FolderNavProps {
  folders: readonly Folder[];
  /** Projects in each folder, its subfolders' included. */
  counts: ReadonlyMap<string, number>;
  /** The folder whose page is open, if any (null on Folders itself). */
  activeId: string | null;
  overviewActive: boolean;
  /** The Folders page or a folder's page is open. */
  foldersActive: boolean;
  /** A new top-level folder. */
  onCreate: () => void;
  actionsFor: (folder: Folder) => MenuItem[];
}

/** Grey icon button beside the Folders tab, the same 44px target as the tree's row controls. */
const SIDE_BUTTON =
  "grid size-11 shrink-0 place-items-center rounded-pill text-muted transition-colors hover:bg-hover hover:text-ink active:bg-seg";

/**
 * Overview and Folders tabs, then the folder tree, which opens under Folders: by itself in
 * the Folders section, from its arrow anywhere. One tint glides between Overview, Folders and
 * the open folder's row: on a folder's page the row holds it (the current page) and Folders
 * keeps its brand label as the current section, taking the tint only while the tree is closed.
 */
export function FolderNav({
  folders,
  counts,
  activeId,
  overviewActive,
  foldersActive,
  onCreate,
  actionsFor,
}: FolderNavProps) {
  const reduce = useReducedMotion();
  const { open, toggle } = useFoldersOpen(foldersActive);
  const baseId = useId();
  const tabId = `${baseId}-folders`;
  const treeId = `${baseId}-tree`;
  const rowShown = open && folders.some((folder) => folder.id === activeId);
  const reveal = reduce ? instant : { duration: duration.component, ease: ease.out };

  return (
    <nav aria-label="Workspace navigation" className="flex min-w-0 flex-col gap-1">
      <NavRow href={OVERVIEW_HREF} icon="layoutGrid" label="Overview" active={overviewActive} />
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1">
          <NavRow
            id={tabId}
            href={FOLDERS_HREF}
            icon="folder"
            label="Folders"
            active={foldersActive && activeId === null}
            inSection={foldersActive && activeId !== null}
            tinted={foldersActive && !rowShown}
          />
        </div>
        <button
          type="button"
          onClick={onCreate}
          aria-label="New folder"
          title="New folder"
          data-testid="new-folder"
          // Below lg the sidebar's New folder button, beside New project, does this job.
          className={`${SIDE_BUTTON} max-lg:hidden`}
        >
          <Icon name="folderPlus" className="size-5" />
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={treeId}
          aria-label="Folder list"
          title={open ? "Hide folders" : "Show folders"}
          data-testid="folders-toggle"
          className={SIDE_BUTTON}
        >
          <motion.span
            className="grid"
            initial={false}
            animate={{ rotate: open ? 90 : 0 }}
            transition={reduce ? instant : spring.snappy}
          >
            <Icon name="chevronRight" className="size-4" />
          </motion.span>
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="tree"
            id={treeId}
            data-testid="folder-list"
            // Clipped only while it opens and closes, so a row's menu can reach past it.
            initial={{ height: 0, opacity: 0, overflow: "hidden" }}
            animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
            exit={{ height: 0, opacity: 0, overflow: "hidden" }}
            transition={reveal}
          >
            <div className="pt-1 pl-2">
              {folders.length ? (
                <FolderTree
                  folders={folders}
                  counts={counts}
                  activeId={activeId}
                  labelledBy={tabId}
                  actionsFor={actionsFor}
                />
              ) : (
                <p data-testid="folder-tree-empty" className="py-2 pl-2 text-meta text-muted">
                  No folders yet. Use the folder-plus button above.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
