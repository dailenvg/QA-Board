"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { usePopVariants } from "@/lib/motion";
import { searchWorkspace } from "@/lib/store/search";
import type { SquintData } from "@/lib/store/types";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useFitAboveKeyboard } from "@/lib/use-fit-above-keyboard";
import { useMediaQuery } from "@/lib/use-media-query";
import { useShortcut } from "@/lib/use-shortcut";
import { Button } from "../ui/Button";
import { FIELD_CLASS } from "../ui/field-styles";
import { Icon } from "../ui/Icon";
import { Kbd } from "../ui/Kbd";
import { SEARCH_HINT, SearchPanel } from "./SearchPanel";
import { useSearchQuery } from "./SearchQueryProvider";
import { moreNote, resultsAnnouncement, searchEntries, type SearchEntry } from "./search-entries";

interface WorkspaceSearchProps {
  data: Pick<SquintData, "folders" | "projects">;
}

const LABEL = "Search projects and folders";

/** Tailwind's `sm` breakpoint, in rem like the CSS, so both agree at any browser font size. */
const ROOMY = "(min-width: 40rem)";

/** The results' height cap (also in their class); phones lower it above the keyboard. */
const POPUP_MAX = "min(70dvh, 32rem)";

/** The count is read out once typing pauses this long, not on every keystroke. */
const ANNOUNCE_DELAY_MS = 400;

/**
 * Finds any project or folder by name, at any depth (WAI-ARIA combobox with a listbox popup).
 * Focus stays in the field: the arrow keys move the active result, Enter opens it, Escape
 * clears and then leaves, handing focus back to where `/` or ⌘K / Ctrl+K summoned it from.
 * Cmd/Ctrl+Enter opens the active result in a new tab and keeps the search open.
 *
 * On phones it starts as an icon button. The field then opens over the button's row: it fills
 * the nearest positioned ancestor (the sidebar header), which hides what it covers through
 * `data-search-open`.
 */
export function WorkspaceSearch({ data }: WorkspaceSearchProps) {
  const router = useRouter();
  const variants = usePopVariants();
  // Mounts only once the store is ready (after hydration), so this is the real value at once.
  const compact = !useMediaQuery(ROOMY);
  // Lives above this component, so a query in progress survives the move across `lg`.
  const [query, setQuery] = useSearchQuery();
  const [open, setOpen] = useState(false);
  /** Phones: the field shows instead of its icon button (and stays out while it holds a query). */
  const [expanded, setExpanded] = useState(() => query !== "");
  const fieldShown = !compact || expanded;
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  /** What had focus when a shortcut summoned the search; Escape returns there. */
  const returnTo = useRef<HTMLElement | null>(null);
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const hintId = `${baseId}-hint`;
  const listboxId = `${baseId}-results`;

  const results = useMemo(() => searchWorkspace(data, query), [data, query]);
  const groups = useMemo(() => searchEntries(results), [results]);
  const entries = useMemo(() => [...groups.folders, ...groups.projects], [groups]);
  // The first result is active until the arrow keys or the pointer pick another.
  const active = entries.find((entry) => entry.key === activeKey) ?? entries[0] ?? null;
  const listed = open && entries.length > 0;
  const optionId = (entry: SearchEntry) => `${baseId}-${entry.key}`;
  const activeId = listed && active ? optionId(active) : undefined;
  const announcement = useDebouncedValue(
    query.trim() ? resultsAnnouncement(results) : "",
    ANNOUNCE_DELAY_MS,
  );
  const popup = useFitAboveKeyboard<HTMLDivElement>(open, POPUP_MAX);

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const focusSearch = () => {
    const from = document.activeElement;
    returnTo.current =
      from instanceof HTMLElement &&
      from !== document.body &&
      from !== input.current &&
      from !== toggle.current
        ? from
        : null;
    // Render the phone's field first: an unmounted input can't take focus. Synchronous, so
    // focus lands inside the tap's gesture and phones raise the keyboard.
    flushSync(() => setExpanded(true));
    input.current?.focus();
    input.current?.select();
  };
  useShortcut("/", focusSearch);
  useShortcut("k", focusSearch, true, { mod: true });

  /** A result is being opened in this tab: reset and step out of the way. */
  const finish = () => {
    setQuery("");
    setActiveKey(null);
    setOpen(false);
    setExpanded(false);
    input.current?.blur();
  };

  /** Enter on the active result. Pointer clicks follow the result's own link instead. */
  const choose = (entry: SearchEntry) => {
    finish();
    router.push(entry.href);
  };

  /**
   * Escape on an empty field, or the phone's close button: out of the search. Phones go back
   * to the icon button; elsewhere focus returns to where a shortcut was pressed, if anywhere.
   */
  const leave = () => {
    const back = returnTo.current;
    input.current?.blur();
    flushSync(() => setExpanded(false));
    if (compact) toggle.current?.focus();
    else if (back?.isConnected) back.focus();
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
      // As Cmd/Ctrl-click does on the result's link: a new tab, and the search stays put.
      if (event.metaKey || event.ctrlKey) window.open(active.href, "_blank", "noopener");
      else choose(active);
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
      data-search-open={compact && expanded ? "" : undefined}
      className="flex shrink-0 justify-end"
    >
      {compact && !expanded ? (
        // Same face as the theme toggle it sits beside.
        <Button
          ref={toggle}
          variant="ghost"
          size="icon"
          aria-label={LABEL}
          title="Search (/)"
          data-testid="search-toggle"
          onClick={focusSearch}
          className="bg-card shadow-seg"
        >
          <Icon name="search" />
        </Button>
      ) : null}
      {/* Wide screens: always there, no entrance. Phones: grows out of the icon button's corner. */}
      <AnimatePresence initial={false}>
        {fieldShown ? (
          <motion.div
            key="field"
            {...(compact
              ? {
                  variants,
                  initial: "hidden",
                  animate: "visible",
                  exit: "exit",
                  style: { transformOrigin: "right center" },
                }
              : {})}
            // z-30: the open results lie over the content below.
            className={
              compact ? "absolute inset-0 z-30 flex items-center" : "relative z-30 w-72 lg:w-80"
            }
          >
            <div
              className="relative w-full"
              onBlur={(event) => {
                // Tab onto the field's own clear or close button keeps a phone's field open.
                const next = event.relatedTarget;
                if (next instanceof Node && event.currentTarget.contains(next)) return;
                if (!query) setExpanded(false);
              }}
            >
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
                aria-describedby={query.trim() ? undefined : hintId}
                // The "/" hint is decorative (aria-hidden); this tells assistive tech instead.
                aria-keyshortcuts="/ Control+K Meta+K"
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
                  // Leaving any other way than Escape: the shortcut's origin no longer applies.
                  returnTo.current = null;
                }}
                onKeyDown={onKeyDown}
                className={`${FIELD_CLASS} pr-12 pl-11 [&::-webkit-search-cancel-button]:appearance-none`}
              />
              {query ? (
                <FieldButton
                  label="Clear search"
                  onPress={() => {
                    setQuery("");
                    setActiveKey(null);
                    input.current?.focus();
                  }}
                />
              ) : compact ? (
                // Phones have no Escape key: a way back out that doesn't depend on tapping away.
                <FieldButton label="Close search" testId="search-close" onPress={leave} />
              ) : (
                <Kbd className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 max-md:hidden">
                  /
                </Kbd>
              )}
              <AnimatePresence>
                {open ? (
                  <motion.div
                    ref={popup}
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
                      onChoose={finish}
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {/* The field's description before typing; `hidden` still counts for aria-describedby. */}
      <p id={hintId} hidden>
        {SEARCH_HINT}
      </p>
      <p className="sr-only" aria-live="polite" data-testid="search-status">
        {announcement}
      </p>
    </div>
  );
}

interface FieldButtonProps {
  label: string;
  testId?: string;
  onPress: () => void;
}

/** The 44px icon button at the field's right end: clear, or close on phones. */
function FieldButton({ label, testId, onPress }: FieldButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      // Keep focus in the field, so the results stay open (and phones keep their keyboard).
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
      className="absolute top-0 right-0 grid size-11 place-items-center rounded-field text-muted transition-colors hover:text-ink active:text-ink"
    >
      <Icon name="close" className="size-4" />
    </button>
  );
}
