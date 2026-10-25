"use client";

import { useId } from "react";
import { flattenFolderTree } from "@/lib/store/folders";
import type { Folder } from "@/lib/store/types";
import { Icon } from "../ui/Icon";

/** "Top level", as a picker value. */
export const TOP_LEVEL = "__top__";

interface FolderTreePickerProps {
  folders: readonly Folder[];
  value: string;
  onChange: (value: string) => void;
  /** Offers "Top level" first (moving a folder; a project always needs a folder). */
  topLevel: boolean;
  /** Why a choice can't be picked, or null when it can. */
  problemFor: (value: string) => string | null;
  legend: string;
}

/**
 * Picks a folder in the folder tree: radio buttons, indented by depth.
 * Choices that can't be picked stay listed, disabled, with the reason beside them.
 */
export function FolderTreePicker({
  folders,
  value,
  onChange,
  topLevel,
  problemFor,
  legend,
}: FolderTreePickerProps) {
  const name = useId();
  const options = [
    ...(topLevel
      ? [{ value: TOP_LEVEL, label: "Top level", depth: 0, icon: "layoutGrid" as const }]
      : []),
    ...flattenFolderTree(folders).map(({ folder, depth }) => ({
      value: folder.id,
      label: folder.name,
      depth: depth + (topLevel ? 1 : 0),
      icon: "folder" as const,
    })),
  ];

  return (
    <fieldset>
      <legend className="mb-2 block text-body font-semibold">{legend}</legend>
      <div
        data-testid="folder-tree-picker"
        className="-mx-1 flex max-h-72 flex-col gap-0.5 overflow-y-auto rounded-tile bg-card p-1 ring-1 ring-line ring-inset"
      >
        {options.map((option) => {
          const problem = problemFor(option.value);
          const selected = option.value === value;
          const reasonId = `${name}-${option.value}-reason`;
          return (
            <label
              key={option.value}
              style={{ paddingLeft: `${0.75 + option.depth}rem` }}
              className={`flex min-h-11 items-center gap-2 rounded-row pr-3 text-body transition-colors has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-focus ${
                problem
                  ? "cursor-not-allowed text-muted"
                  : selected
                    ? "cursor-pointer bg-brand-soft font-semibold text-ink"
                    : "cursor-pointer hover:bg-hover"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                disabled={Boolean(problem)}
                aria-describedby={problem ? reasonId : undefined}
                // The dialog opens on the chosen folder, not on the first enabled one.
                data-autofocus={selected && !problem ? true : undefined}
                onChange={() => onChange(option.value)}
                // brand-text: cobalt is 2.4:1 on dark cards (WCAG 1.4.11), the dark variant 7.8:1.
                className="size-4 shrink-0 accent-brand-text"
              />
              <Icon name={option.icon} className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {problem ? (
                <span id={reasonId} className="shrink-0 text-label">
                  {problem}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
