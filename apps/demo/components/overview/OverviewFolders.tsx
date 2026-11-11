"use client";

import { useMemo, useState } from "react";
import { workspaceLabels } from "@/lib/store/archive";
import { childFolders } from "@/lib/store/folders";
import { DashboardEmpty } from "../dashboard/DashboardEmpty";
import { LabelFilter } from "../dashboard/LabelFilter";
import { SortControls } from "../dashboard/SortControls";
import {
  noMatchKind,
  STATUS_FILTER_OPTIONS,
  type ProjectFilter,
  type StatusFilterValue,
} from "../dashboard/status-filter";
import { focusStatusFilter, StatusFilter } from "../dashboard/StatusFilter";
import { useProjectFilter } from "../dashboard/use-project-filter";
import type { Workspace } from "../dashboard/workspace-context";
import { foldersMatching } from "./folder-files";
import { FolderGrid } from "./FolderGrid";
import { FOLDER_SORT, folderStats, sortFolders } from "./folder-sort";
import { useFolderSort } from "./use-folder-sort";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** What the live region says the filters are: "Archived", "Comments in, Urgent". */
function filterName(filter: ProjectFilter): string {
  const status = STATUS_FILTER_OPTIONS.find((option) => option.value === filter.status)?.label;
  return filter.label === null ? (status ?? "") : `${status ?? ""}, ${filter.label}`;
}

/**
 * Folders' top-level folders in the chosen order, under the status and label filters (as on
 * folder pages) and, once there are two or more to order, the sort controls. A filter shows
 * only the folders holding a project it shows, subfolders included, each holding and counting
 * just those projects; the sort then goes by them too. Archived projects show under Archived
 * only.
 */
export function OverviewFolders({ workspace }: { workspace: Workspace }) {
  const { allData: data, folders } = workspace;
  const { sort, setKey, reverse } = useFolderSort();
  const labels = useMemo(() => workspaceLabels(data), [data]);
  const { filter, setStatus, setLabel, reset } = useProjectFilter(labels);
  // Silent until the person picks a filter, so a background sync under All says nothing.
  const [picked, setPicked] = useState(false);
  const pickStatus = (value: StatusFilterValue) => {
    setStatus(value);
    setPicked(true);
  };
  const pickLabel = (value: string | null) => {
    setLabel(value);
    setPicked(true);
  };
  const topLevel = useMemo(() => childFolders(folders, null), [folders]);
  const sorted = useMemo(
    () =>
      sortFolders(
        folderStats(data, foldersMatching(data, topLevel, filter), filter),
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
        narrow screens; the label filter and sort drop below it (sort on the right, its menu
        opening leftward from there).
      */}
      <div className="flex max-w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-2 [@media(hover:none)]:pb-10">
        <StatusFilter value={filter.status} onChange={pickStatus} />
        <LabelFilter labels={labels} value={filter.label} onChange={pickLabel} />
        {sorted.length > 1 ? (
          <div className="ml-auto">
            <SortControls sort={sort} options={FOLDER_SORT} onKey={setKey} onReverse={reverse} />
          </div>
        ) : null}
      </div>
      {/* The filter's name too, so switching between two with the same count is still heard. */}
      <p className="sr-only" aria-live="polite">
        {picked ? `${filterName(filter)}: ${plural(sorted.length, "folder")}` : ""}
      </p>
      {sorted.length === 0 ? (
        <div className="pt-4">
          <DashboardEmpty
            kind={noMatchKind(filter, "folders")}
            onAction={() => {
              reset();
              setPicked(true);
              focusStatusFilter();
            }}
          />
        </div>
      ) : (
        <FolderGrid
          workspace={workspace}
          folders={sorted}
          labelledBy="folders-overview-heading"
          filter={filter}
        />
      )}
    </section>
  );
}
