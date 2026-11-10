"use client";

import type { ReactNode } from "react";
import type { Folder } from "@/lib/store/types";
import { Menu, type MenuItem } from "../ui/Menu";
import { PROJECT_SORT, type ProjectSort, type SortKey } from "./project-sort";
import { SortControls } from "./SortControls";
import type { StatusFilterValue } from "./status-filter";
import { StatusFilter } from "./StatusFilter";

interface DashboardHeaderProps {
  folder: Folder;
  chips: readonly string[];
  filter: StatusFilterValue;
  onFilter: (value: StatusFilterValue) => void;
  sort: ProjectSort;
  onSortKey: (key: SortKey) => void;
  onReverseSort: () => void;
  /** The folder's actions (new folder inside, rename, move, delete). */
  actions: MenuItem[];
  /** Where the folder sits, above its name. */
  breadcrumb: ReactNode;
}

/** Folder title with summary chips, folder actions, the status filter and the sort controls. */
export function DashboardHeader({
  folder,
  chips,
  filter,
  onFilter,
  sort,
  onSortKey,
  onReverseSort,
  actions,
  breadcrumb,
}: DashboardHeaderProps) {
  return (
    // No horizontal padding: title, filter and project grid share main's content box.
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pt-2">
      <div className="min-w-0">
        {breadcrumb}
        <div className="flex items-center gap-1">
          <h1 className="truncate text-title font-bold">{folder.name}</h1>
          <Menu label="Folder actions" testId="folder-menu" items={actions} />
        </div>
        <ul className="mt-1 flex flex-wrap gap-2" aria-label="Folder summary">
          {chips.map((chip) => (
            <li
              key={chip}
              className="rounded-pill bg-panel px-3 py-1 text-label font-medium text-ink-2"
            >
              {chip}
            </li>
          ))}
        </ul>
      </div>
      {/*
        Wraps on narrow screens: the filter scrolls across the full width, sort drops below it on
        the right (its menu opens leftward from there, staying on screen).
      */}
      <div className="flex max-w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <StatusFilter value={filter} onChange={onFilter} />
        <div className="ml-auto">
          <SortControls
            sort={sort}
            options={PROJECT_SORT}
            onKey={onSortKey}
            onReverse={onReverseSort}
          />
        </div>
      </div>
    </header>
  );
}
