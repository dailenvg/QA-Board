"use client";

import { OVERVIEW_HREF } from "@/lib/routes";
import type { Folder } from "@/lib/store/types";
import { Icon } from "../ui/Icon";
import type { MenuItem } from "../ui/Menu";
import { FolderTree } from "./FolderTree";
import { NavRow } from "./NavRow";

interface FolderNavProps {
  folders: readonly Folder[];
  /** Projects in each folder, its subfolders' included. */
  counts: ReadonlyMap<string, number>;
  /** The folder whose page is open, if any. */
  activeId: string | null;
  overviewActive: boolean;
  /** A new top-level folder. */
  onCreate: () => void;
  actionsFor: (folder: Folder) => MenuItem[];
}

/** Overview link, then the folder tree. One active indicator glides between them. */
export function FolderNav({
  folders,
  counts,
  activeId,
  overviewActive,
  onCreate,
  actionsFor,
}: FolderNavProps) {
  return (
    <nav aria-label="Workspace navigation" className="flex min-w-0 flex-col gap-3">
      <NavRow href={OVERVIEW_HREF} icon="layoutGrid" label="Overview" active={overviewActive} />
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-2 pl-2">
          <h2 id="folders-heading" className="text-label font-semibold text-muted">
            Folders
          </h2>
          <button
            type="button"
            onClick={onCreate}
            aria-label="New folder"
            title="New folder"
            data-testid="new-folder"
            className="grid size-11 place-items-center rounded-pill text-muted transition-colors hover:bg-hover hover:text-ink active:bg-seg"
          >
            <Icon name="folderPlus" className="size-5" />
          </button>
        </div>
        <FolderTree
          folders={folders}
          counts={counts}
          activeId={activeId}
          labelledBy="folders-heading"
          actionsFor={actionsFor}
        />
      </div>
    </nav>
  );
}
