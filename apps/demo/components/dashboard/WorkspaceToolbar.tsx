"use client";

import type { ReactNode } from "react";
import { useAttentionReporter } from "@/lib/squiggy/attention";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Kbd } from "../ui/Kbd";
import { Skeleton } from "../ui/Skeleton";

interface WorkspaceToolbarProps {
  /** The workspace search, or null until the store and the media query are both known. */
  search: ReactNode;
  onNewProject: () => void;
  /** Inside the open folder, else at the top level (see `Workspace`). */
  onNewFolder: () => void;
  /** The open folder New folder creates in; null at the top level. */
  newFolderIn: string | null;
}

/**
 * The top of the page on wide screens: search, then the create actions. Hidden
 * below `lg` by CSS (so it never pops in after hydration), where the sidebar
 * stacks above the page and carries them instead. Skeletons hold the row's
 * shape (field, then two pills of the buttons' widths) until it's ready.
 * z-30: the open search results lie over the page below.
 */
export function WorkspaceToolbar({
  search,
  onNewProject,
  onNewFolder,
  newFolderIn,
}: WorkspaceToolbarProps) {
  const attention = useAttentionReporter("toolbar-button");
  // Inside a folder, the name and tooltip say where it goes; the visible label stays short.
  const newFolderName = newFolderIn ? `New folder in ${newFolderIn}` : undefined;
  return (
    <div
      data-testid="workspace-toolbar"
      className="relative z-30 flex items-center justify-between gap-4 max-lg:hidden"
    >
      <div className="flex max-w-xl min-w-0 flex-1">
        {search ?? <Skeleton className="h-11 w-full rounded-field" />}
      </div>
      {search ? (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            onClick={onNewFolder}
            aria-label={newFolderName}
            title={newFolderName}
            data-testid="toolbar-new-folder"
          >
            <Icon name="folderPlus" className="size-5" />
            New folder
          </Button>
          <Button
            onClick={onNewProject}
            title="New project (N)"
            data-testid="toolbar-new-project"
            {...attention}
          >
            <Icon name="plus" className="size-5" />
            New project
            <Kbd className="border-on-brand/40 text-on-brand/80 max-md:hidden">N</Kbd>
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 gap-2">
          <Skeleton className="h-11 w-38 rounded-pill" />
          <Skeleton className="h-11 w-48 rounded-pill" />
        </div>
      )}
    </div>
  );
}
