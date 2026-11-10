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
  /** The Folders page or a folder's page is open. */
  foldersActive: boolean;
  onNewProject: () => void;
  /** A new top-level folder (the "+" by the Folders tab). */
  onNewFolder: () => void;
  /** A new folder inside the open folder, else at the top level (beside New project). */
  onNewFolderHere: () => void;
  /** The open folder `onNewFolderHere` creates in; null at the top level. */
  newFolderIn?: string | null;
  /**
   * The workspace search, below `lg`: the sidebar comes first on stacked screens, so its header
   * is the top right of the page there. None on the account settings.
   */
  search?: ReactNode;
  /** The profile card (who is signed in, their account menu): at the foot of the panel. */
  account?: ReactNode;
}

/**
 * The workspace's side panel, in three blocks stacked with the page's gap: the brand, on
 * Squint's lime; the navigation; and the profile. From `lg` the column is sticky and exactly
 * fills the screen's height (inside the page's gutters): the brand and profile keep their size
 * and the navigation takes the rest, scrolling inside itself (on a brand scrollbar) when there
 * are many folders. Below `lg` it's the top of the screen, at its natural height, so the brand
 * block carries search and a theme toggle and the navigation the create actions; wide screens
 * have those in the page's toolbar.
 */
export function Sidebar({
  folders,
  counts,
  actionsFor,
  activeId,
  overviewActive,
  foldersActive,
  onNewProject,
  onNewFolder,
  onNewFolderHere,
  newFolderIn = null,
  search = null,
  account = null,
}: SidebarProps) {
  const attention = useAttentionReporter("sidebar-button");
  // Inside a folder, the name and tooltip say where it goes (phones see only the icon).
  const newFolderName = newFolderIn ? `New folder in ${newFolderIn}` : "New folder";
  return (
    <aside
      aria-label="Workspace"
      className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)] lg:w-sidebar lg:shrink-0"
    >
      {/*
        The brand block. Below lg a panel holding the lime brand, search and the theme toggle;
        from lg the lime brand alone is the block.
      */}
      <div className="shrink-0 rounded-panel bg-panel p-4 lg:bg-transparent lg:p-0">
        {/*
          relative: a phone's open search field fills this row. While it does, what it covers is
          hidden (visibility), so Tab and screen readers can't reach controls under the field.
        */}
        <div
          data-testid="sidebar-header"
          className="relative flex min-h-11 items-center gap-2 [&:has([data-search-open])_[data-search-covered]]:invisible"
        >
          <div
            data-search-covered=""
            data-testid="sidebar-brand"
            className="mr-auto flex min-w-0 rounded-card bg-highlight py-1 pr-2 pl-1 lg:mr-0 lg:flex-1 lg:rounded-panel lg:p-4"
          >
            <Logo caption="Visual review" size="large" tone="on-highlight" mark="inverse" />
          </div>
          {search}
          <div data-search-covered="" className="flex lg:hidden">
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/*
        The navigation block. Its padding sits inside the scroller, so focus rings at the
        rows' edges never get cut off; scroll-padding keeps that room when Tab scrolls a row
        into view. data-menu-bounds: a folder row's menu opens on whichever side has room
        inside this scroller, not the screen, so it isn't cut off at the scroller's edge.
      */}
      <div
        data-testid="sidebar-nav"
        data-menu-bounds=""
        className="scrollbar-brand flex min-w-0 flex-col gap-5 rounded-panel bg-panel p-4 lg:min-h-0 lg:flex-1 lg:scroll-py-4 lg:overflow-y-auto"
      >
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
          foldersActive={foldersActive}
          onCreate={onNewFolder}
        />
      </div>

      {account ? (
        <div data-testid="sidebar-account" className="shrink-0 rounded-panel bg-panel p-2">
          {account}
        </div>
      ) : null}
    </aside>
  );
}
