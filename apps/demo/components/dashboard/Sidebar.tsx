"use client";

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
  onNewFolder: () => void;
}

/** Floating workspace panel: brand, primary action, navigation and appearance. */
export function Sidebar({
  folders,
  counts,
  actionsFor,
  activeId,
  overviewActive,
  persistent,
  onNewProject,
  onNewFolder,
}: SidebarProps) {
  return (
    <aside
      aria-label="Workspace"
      className="flex min-w-0 flex-col gap-5 rounded-panel bg-panel p-4 lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)] lg:w-sidebar lg:shrink-0 lg:overflow-y-auto"
    >
      <div className="flex items-center justify-between gap-3 px-2">
        <Logo caption="Visual review" />
        <ThemeToggle className="lg:hidden" />
      </div>

      <Button
        onClick={onNewProject}
        className="w-full"
        title="New project (N)"
        data-testid="new-project"
      >
        <Icon name="plus" className="size-5" />
        New project
        <Kbd className="border-on-brand/40 text-on-brand/80 max-md:hidden">N</Kbd>
      </Button>

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
