"use client";

import { useMemo } from "react";
import { childFolders } from "@/lib/store/folders";
import { SortControls } from "../dashboard/SortControls";
import type { Workspace } from "../dashboard/workspace-context";
import { FolderGrid } from "./FolderGrid";
import { FOLDER_SORT, folderStats, sortFolders } from "./folder-sort";
import { useFolderSort } from "./use-folder-sort";

/**
 * The Overview's top-level folders in the chosen order, with the sort controls
 * above them once there are two or more to order.
 */
export function OverviewFolders({ workspace }: { workspace: Workspace }) {
  const { data, folders } = workspace;
  const { sort, setKey, reverse } = useFolderSort();
  const topLevel = useMemo(() => childFolders(folders, null), [folders]);
  const sorted = useMemo(
    () => sortFolders(folderStats(data, topLevel), sort.key, sort.direction),
    [data, topLevel, sort],
  );

  return (
    <section aria-labelledby="folders-overview-heading" className="flex flex-col">
      <h2 id="folders-overview-heading" className="sr-only">
        Folders
      </h2>
      {sorted.length > 1 ? (
        // On touch, folder cards pull their headroom up (FolderCard); this padding takes it,
        // so the first row never sits over the controls.
        <div className="flex justify-end px-4 [@media(hover:none)]:pb-10">
          <SortControls sort={sort} options={FOLDER_SORT} onKey={setKey} onReverse={reverse} />
        </div>
      ) : null}
      <FolderGrid workspace={workspace} folders={sorted} labelledBy="folders-overview-heading" />
    </section>
  );
}
