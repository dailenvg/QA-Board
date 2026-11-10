"use client";

import { useMemo, useState } from "react";
import { childFolders } from "@/lib/store/folders";
import { DashboardEmpty } from "../dashboard/DashboardEmpty";
import { SortControls } from "../dashboard/SortControls";
import { STATUS_FILTER_OPTIONS, type StatusFilterValue } from "../dashboard/status-filter";
import { focusStatusFilter, StatusFilter } from "../dashboard/StatusFilter";
import type { Workspace } from "../dashboard/workspace-context";
import { foldersWithStatus } from "./folder-files";
import { FolderGrid } from "./FolderGrid";
import { FOLDER_SORT, folderStats, sortFolders } from "./folder-sort";
import { useFolderSort } from "./use-folder-sort";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Folders' top-level folders in the chosen order, under the status filter (as on folder
 * pages) and, once there are two or more to order, the sort controls. A status shows only the
 * folders holding a project with it, subfolders included, each holding and counting just those
 * projects; the sort then goes by them too.
 */
export function OverviewFolders({ workspace }: { workspace: Workspace }) {
  const { data, folders } = workspace;
  const { sort, setKey, reverse } = useFolderSort();
  const [filter, setFilter] = useState<StatusFilterValue>("all");
  // Silent until the person picks a filter, so a background sync under All says nothing.
  const [picked, setPicked] = useState(false);
  const pickFilter = (value: StatusFilterValue) => {
    setFilter(value);
    setPicked(true);
  };
  const filterLabel = STATUS_FILTER_OPTIONS.find((option) => option.value === filter)?.label;
  const topLevel = useMemo(() => childFolders(folders, null), [folders]);
  const sorted = useMemo(
    () =>
      sortFolders(
        folderStats(data, foldersWithStatus(data, topLevel, filter), filter),
        sort.key,
        sort.direction,
      ),
    [data, topLevel, filter, sort],
  );

  return (
    <section aria-labelledby="folders-overview-heading" className="flex flex-col">
      <h2 id="folders-overview-heading" className="sr-only">
        Folders
      </h2>
      {/*
        On touch, folder cards pull their headroom up (FolderCard); this padding takes it, so
        the first row never sits over the controls. The filter scrolls across the full width on
        narrow screens; sort drops below it on the right (its menu opens leftward from there).
      */}
      <div className="flex max-w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-2 [@media(hover:none)]:pb-10">
        <StatusFilter value={filter} onChange={pickFilter} />
        {sorted.length > 1 ? (
          <div className="ml-auto">
            <SortControls sort={sort} options={FOLDER_SORT} onKey={setKey} onReverse={reverse} />
          </div>
        ) : null}
      </div>
      {/* The filter's name too, so switching between two with the same count is still heard. */}
      <p className="sr-only" aria-live="polite">
        {picked ? `${filterLabel}: ${plural(sorted.length, "folder")}` : ""}
      </p>
      {sorted.length === 0 ? (
        <div className="pt-4">
          <DashboardEmpty
            kind="folders"
            onAction={() => {
              pickFilter("all");
              focusStatusFilter();
            }}
          />
        </div>
      ) : (
        <FolderGrid
          workspace={workspace}
          folders={sorted}
          labelledBy="folders-overview-heading"
          status={filter}
        />
      )}
    </section>
  );
}
