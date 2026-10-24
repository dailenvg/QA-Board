"use client";

import { OVERVIEW_HREF, folderHref } from "@/lib/routes";
import type { Folder } from "@/lib/store/types";
import { Icon } from "../ui/Icon";
import { NavRow } from "./NavRow";

export interface FolderEntry {
  folder: Folder;
  count: number;
}

interface FolderNavProps {
  entries: readonly FolderEntry[];
  /** The folder whose page is open, if any. */
  activeId: string | null;
  overviewActive: boolean;
  onCreate: () => void;
}

/** Overview link, then the folder list. One active indicator glides between them. */
export function FolderNav({ entries, activeId, overviewActive, onCreate }: FolderNavProps) {
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
        <ul
          aria-labelledby="folders-heading"
          className="-m-1 flex gap-1 overflow-x-auto p-1 lg:flex-col lg:overflow-visible"
        >
          {entries.map(({ folder, count }) => (
            <li key={folder.id} className="shrink-0 lg:shrink">
              <NavRow
                href={folderHref(folder.id)}
                icon="folder"
                label={folder.name}
                active={folder.id === activeId}
              >
                <span className="relative text-label font-semibold text-muted tabular-nums">
                  <span className="sr-only">, </span>
                  {count}
                  <span className="sr-only"> {count === 1 ? "project" : "projects"}</span>
                </span>
              </NavRow>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
