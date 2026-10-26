"use client";

import type { ReactNode } from "react";
import { useAttentionReporter } from "@/lib/squiggy/attention";
import { Logo } from "../brand/Logo";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Kbd } from "../ui/Kbd";
import { ThemeToggle } from "../ui/ThemeToggle";
import type { Folder } from "@/lib/store/types";
import type { MenuItem } from "../ui/Menu";
import { FolderNav } from "./FolderNav";

interface SidebarProps {
  folders: readonly Folder[];
  /** Projects in each folder, its subfolders' included. */
  counts: ReadonlyMap<string, number>;
  actionsFor: (folder: Folder) => MenuItem[];
  activeId: string | null;
  overviewActive: boolean;
  persistent: boolean;
  onNewProject: () => void;
  /** A new top-level folder (the "+" by the Folders heading). */
  onNewFolder: () => void;
  /** A new folder inside the open folder, else at the top level (beside New project). */
  onNewFolderHere: () => void;
  /** The open folder `onNewFolderHere` creates in; null at the top level. */
  newFolderIn?: string | null;
  /**
   * The workspace search, below `lg`: the sidebar comes first on stacked screens, so its header
   * is the top right of the page there.
   */
  search?: ReactNode;
}

/**
 * Floating workspace panel: brand, navigation and appearance. Below `lg` it's the top of the
 * screen, so it carries the create actions too; wide screens have them in the page's toolbar.
 */
export function Sidebar({
  folders,
  counts,
  actionsFor,
  activeId,
  overviewActive,
  persistent,
  onNewProject,
  onNewFolder,
  onNewFolderHere,
  newFolderIn = null,
  search = null,
}: SidebarProps) {
  const attention = useAttentionReporter("sidebar-button");
  // Inside a folder, the name and tooltip say where it goes (phones see only the icon).
  const newFolderName = newFolderIn ? `New folder in ${newFolderIn}` : "New folder";
  return (
    <aside
      aria-label="Workspace"
      className="flex min-w-0 flex-col gap-5 rounded-panel bg-panel p-4 lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)] lg:w-sidebar lg:shrink-0 lg:overflow-y-auto"
    >
      {/*
        relative: a phone's open search field fills this row. While it does, what it covers is
        hidden (visibility), so Tab and screen readers can't reach controls under the field.
      */}
      <div
        data-testid="sidebar-header"
        className="relative flex min-h-11 items-center gap-2 px-2 [&:has([data-search-open])_[data-search-covered]]:invisible"
      >
        <div data-search-covered="" className="mr-auto flex min-w-0">
          <Logo caption="Visual review" />
        </div>
        {search}
        <div data-search-covered="" className="flex lg:hidden">
          <ThemeToggle />
        </div>
      </div>

      <div className="flex gap-2 lg:hidden">
        <Button
          onClick={onNewProject}
          className="flex-1"
          title="New project (N)"
          data-testid="new-project"
          {...attention}
        >
          <Icon name="plus" className="size-5" />
          New project
          <Kbd className="border-on-brand/40 text-on-brand/80 max-md:hidden">N</Kbd>
        </Button>
        {/* Icon-only on phones, where both labels don't fit one row; the name stays for readers. */}
        <Button
          variant="secondary"
          onClick={onNewFolderHere}
          aria-label={newFolderIn ? newFolderName : undefined}
          title={newFolderName}
          data-testid="sidebar-new-folder"
          className="max-sm:size-11 max-sm:px-0"
        >
          <Icon name="folderPlus" className="size-5" />
          <span className="max-sm:sr-only">New folder</span>
        </Button>
      </div>

      <FolderNav
        folders={folders}
        counts={counts}
        actionsFor={actionsFor}
        activeId={activeId}
        overviewActive={overviewActive}
        onCreate={onNewFolder}
      />

      <div className="mt-auto hidden flex-col gap-3 rounded-card bg-card p-4 lg:flex">
        <div>
          <p className="text-heading font-bold">
            {persistent ? "Saved in this browser" : "Not saved"}
          </p>
          <p className="mt-1 text-meta text-muted">
            {persistent
              ? "Projects and comments stay in this browser. Clearing site data removes them."
              : "This browser blocks storage, so changes last until you reload or close the tab."}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="text-body font-medium">Appearance</span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
