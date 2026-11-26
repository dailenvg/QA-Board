"use client";

import { Menu, type MenuItem } from "../ui/Menu";
import {
  FILTER_LABEL,
  isDefaultView,
  SORT_LABEL,
  type CommentSort,
  type CommentView,
  type PriorityFilter,
} from "./priority-view";

const SORTS: readonly CommentSort[] = ["pin", "priority"];
const FILTERS: readonly PriorityFilter[] = ["all", "must", "should", "nit", "none"];

interface CommentViewMenuProps {
  view: CommentView;
  onChange: (view: CommentView) => void;
}

function viewItems({ view, onChange }: CommentViewMenuProps): MenuItem[] {
  return [
    ...SORTS.map((sort) => ({
      label: SORT_LABEL[sort],
      group: "Sort by",
      checked: view.sort === sort,
      onSelect: () => onChange({ ...view, sort }),
      testId: `comment-sort-${sort}`,
    })),
    ...FILTERS.map((filter) => ({
      label: FILTER_LABEL[filter],
      group: "Show",
      checked: view.filter === filter,
      onSelect: () => onChange({ ...view, filter }),
      testId: `comment-filter-${filter}`,
    })),
  ];
}

/**
 * The comments panel's "Sort and filter" button (U5): one menu to sort by pin
 * number or priority, and to show every priority or one. A dot marks it while
 * either is changed; the viewer says how many comments show.
 */
export function CommentViewMenu(props: CommentViewMenuProps) {
  return (
    <Menu
      label="Sort and filter"
      icon="arrowUpDown"
      indicator={!isDefaultView(props.view)}
      items={viewItems(props)}
      testId="comment-view"
    />
  );
}
