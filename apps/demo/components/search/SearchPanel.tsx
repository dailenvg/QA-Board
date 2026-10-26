"use client";

import { LayoutGroup } from "motion/react";
import { Icon } from "../ui/Icon";
import { Kbd } from "../ui/Kbd";
import { SearchOption } from "./SearchOption";
import type { SearchEntry, SearchEntryGroups } from "./search-entries";

interface SearchPanelProps {
  query: string;
  groups: SearchEntryGroups;
  /** "+3 more projects", when the caps left some out. */
  more: string | null;
  listboxId: string;
  optionId: (entry: SearchEntry) => string;
  activeKey: string | null;
  onHover: (entry: SearchEntry) => void;
  /** A result's link was clicked to open in this tab (it navigates itself). */
  onChoose: (entry: SearchEntry) => void;
}

/** What the open search shows: a hint before typing, the grouped results, or why there are none. */
export function SearchPanel({ query, groups, more, listboxId, ...listProps }: SearchPanelProps) {
  if (!query.trim()) {
    return (
      <p className="flex items-center gap-3 px-3 py-2 text-meta text-muted">
        <Icon name="search" className="size-4 shrink-0" />
        Type part of a project or folder name. Search covers every folder.
      </p>
    );
  }
  if (!groups.folders.length && !groups.projects.length) {
    return (
      <div
        data-testid="search-empty"
        className="flex flex-col items-center gap-2 px-4 py-6 text-center"
      >
        <span className="grid size-10 place-items-center rounded-pill bg-tile text-muted">
          <Icon name="search" className="size-5" />
        </span>
        <p className="text-body font-semibold text-ink">
          Nothing is named &ldquo;{query.trim()}&rdquo;
        </p>
        <p className="text-meta text-muted">Check the spelling, or try fewer letters.</p>
      </div>
    );
  }
  return (
    <>
      <LayoutGroup id={listboxId}>
        <div
          role="listbox"
          id={listboxId}
          aria-label="Search results"
          className="flex flex-col gap-2"
        >
          <ResultGroup
            title="Folders"
            headingId={`${listboxId}-folders`}
            entries={groups.folders}
            {...listProps}
          />
          <ResultGroup
            title="Projects"
            headingId={`${listboxId}-projects`}
            entries={groups.projects}
            {...listProps}
          />
        </div>
      </LayoutGroup>
      {more ? (
        <p data-testid="search-more" className="px-3 pt-2 text-meta text-muted">
          {more}. Keep typing to narrow it down.
        </p>
      ) : null}
      <p
        aria-hidden="true"
        className="mt-2 flex items-center gap-3 border-t border-line px-3 pt-2 text-label text-muted max-sm:hidden"
      >
        <span className="inline-flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> to move
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Enter</Kbd> to open
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Esc</Kbd> to clear
        </span>
      </p>
    </>
  );
}

interface ResultGroupProps extends Pick<
  SearchPanelProps,
  "optionId" | "activeKey" | "onHover" | "onChoose"
> {
  title: string;
  headingId: string;
  entries: readonly SearchEntry[];
}

function ResultGroup({
  title,
  headingId,
  entries,
  optionId,
  activeKey,
  onHover,
  onChoose,
}: ResultGroupProps) {
  if (!entries.length) return null;
  return (
    <div role="group" aria-labelledby={headingId}>
      <div id={headingId} role="presentation" className="label-caps px-3 pt-1 pb-1 text-muted">
        {title}
      </div>
      {entries.map((entry) => (
        <SearchOption
          key={entry.key}
          id={optionId(entry)}
          entry={entry}
          active={entry.key === activeKey}
          onHover={() => onHover(entry)}
          onChoose={() => onChoose(entry)}
        />
      ))}
    </div>
  );
}
