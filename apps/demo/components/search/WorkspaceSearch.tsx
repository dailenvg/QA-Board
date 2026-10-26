"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { usePopVariants } from "@/lib/motion";
import { searchWorkspace } from "@/lib/store/search";
import type { SquintData } from "@/lib/store/types";
import { useShortcut } from "@/lib/use-shortcut";
import { Button } from "../ui/Button";
import { FIELD_CLASS } from "../ui/field-styles";
import { Icon } from "../ui/Icon";
import { Kbd } from "../ui/Kbd";
import { SearchPanel } from "./SearchPanel";
import { moreNote, resultsAnnouncement, searchEntries, type SearchEntry } from "./search-entries";

interface WorkspaceSearchProps {
  data: Pick<SquintData, "folders" | "projects">;
}

const LABEL = "Search projects and folders";

/**
 * Finds any project or folder by name, at any depth (WAI-ARIA combobox with a listbox popup).
 * Focus stays in the field: the arrow keys move the active result, Enter opens it, Escape
 * clears and then leaves. `/` or ⌘K / Ctrl+K focuses it from anywhere in the workspace. On
 * phones it starts as an icon button that opens the field full width.
 */
export function WorkspaceSearch({ data }: WorkspaceSearchProps) {
  const router = useRouter();
  const variants = usePopVariants();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  /** Phones: the field shows instead of its icon button. */
  const [expanded, setExpanded] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-results`;

  const results = useMemo(() => searchWorkspace(data, query), [data, query]);
  const groups = useMemo(() => searchEntries(results), [results]);
  const entries = useMemo(() => [...groups.folders, ...groups.projects], [groups]);
  // The first result is active until the arrow keys or the pointer pick another.
  const active = entries.find((entry) => entry.key === activeKey) ?? entries[0] ?? null;
  const listed = open && entries.length > 0;
  const optionId = (entry: SearchEntry) => `${baseId}-${entry.key}`;
  const activeId = listed && active ? optionId(active) : undefined;
  const announcement = query.trim() ? resultsAnnouncement(results) : "";

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const focusSearch = () => {
    // Render the phone's field first: a hidden input can't take focus.
    flushSync(() => setExpanded(true));
    input.current?.focus();
    input.current?.select();
  };
  useShortcut("/", focusSearch);
  useShortcut("k", focusSearch, true, { mod: true });

  const choose = (entry: SearchEntry) => {
    setQuery("");
    setActiveKey(null);
    setOpen(false);
    setExpanded(false);
    input.current?.blur();
    router.push(entry.href);
  };

  /** Escape on an empty field: out of the search, back to the icon button on phones. */
  const leave = () => {
    input.current?.blur();
    flushSync(() => setExpanded(false));
    toggle.current?.focus();
  };

  const move = (step: 1 | -1) => {
    setOpen(true);
    if (!entries.length) return;
    const index = active ? entries.indexOf(active) : -1;
    setActiveKey(entries[(index + step + entries.length) % entries.length]?.key ?? null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" && listed && active) {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (query) {
        setQuery("");
        setActiveKey(null);
      } else {
        leave();
      }
    }
  };

  return (
    <div
      role="search"
      aria-label="Projects and folders"
      className="relative flex w-full justify-end sm:w-auto"
    >
      {expanded ? null : (
        <Button
          ref={toggle}
          variant="secondary"
          size="icon"
          aria-label={LABEL}
          title="Search (/)"
          data-testid="search-toggle"
          onClick={focusSearch}
          className="sm:hidden"
        >
          <Icon name="search" />
        </Button>
      )}
      <div className={`relative w-full sm:w-72 lg:w-80 ${expanded ? "" : "max-sm:hidden"}`}>
        <label htmlFor={inputId} className="sr-only">
          {LABEL}
        </label>
        <Icon
          name="search"
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted"
        />
        <input
          ref={input}
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={listed}
          aria-controls={listed ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="Search projects and folders"
          data-testid="search-input"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveKey(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            if (!query) setExpanded(false);
          }}
          onKeyDown={onKeyDown}
          className={`${FIELD_CLASS} pr-12 pl-11 [&::-webkit-search-cancel-button]:appearance-none`}
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            // Keep focus in the field, so the results stay open.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setQuery("");
              setActiveKey(null);
              input.current?.focus();
            }}
            className="absolute top-0 right-0 grid size-11 place-items-center rounded-field text-muted transition-colors hover:text-ink active:text-ink"
          >
            <Icon name="close" className="size-4" />
          </button>
        ) : (
          <Kbd className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 max-md:hidden">
            /
          </Kbd>
        )}
        <AnimatePresence>
          {open ? (
            <motion.div
              key="results"
              variants={variants}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{ transformOrigin: "top right" }}
              data-testid="search-popup"
              // Choosing with the pointer must not blur the field first (that closes the results).
              onMouseDown={(event) => event.preventDefault()}
              className="absolute top-full right-0 mt-2 max-h-[min(70dvh,32rem)] w-full overflow-y-auto overscroll-contain rounded-tile bg-card p-2 shadow-pop ring-1 ring-line sm:w-[26rem] sm:max-w-[calc(100vw-2rem)]"
            >
              <SearchPanel
                query={query}
                groups={groups}
                more={moreNote(results)}
                listboxId={listboxId}
                optionId={optionId}
                activeKey={active?.key ?? null}
                onHover={(entry) => setActiveKey(entry.key)}
                onChoose={choose}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <p className="sr-only" aria-live="polite" data-testid="search-status">
        {announcement}
      </p>
    </div>
  );
}
