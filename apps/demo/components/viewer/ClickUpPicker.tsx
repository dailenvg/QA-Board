"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { instant, spring, usePopVariants } from "@/lib/motion";
import { FIELD_CLASS } from "../ui/field-styles";
import { FieldError } from "../ui/FieldError";
import { Icon } from "../ui/Icon";
import { CLICKUP_SEND_COPY } from "./clickup-send-copy";
import { filterClickUpOptions, type ClickUpOption } from "./clickup-options";

interface ClickUpPickerProps {
  label: string;
  /** The search field's placeholder; `label` names it. */
  searchPlaceholder: string;
  options: readonly ClickUpOption[];
  /** Checkboxes (several) instead of radios (one). */
  multiple?: boolean;
  value: readonly string[];
  onChange: (ids: string[]) => void;
  /** The most that can be picked, with `multiple`; what says so when it's reached. */
  max?: { count: number; message: string };
  /** A first radio that picks nobody, for a choice that can be left out. */
  noneLabel?: string;
  /** Beside the label: "Optional", or a limit. */
  aside?: string;
  /** A line under the label, such as who's told of the choice. */
  hint?: string;
  /** The list is being read again: marked busy (not dimmed, so it keeps its contrast), still usable. */
  busy?: boolean;
  /** A choice that must be made: "Required" beside the label, and its radios say so. */
  required?: boolean;
  /** Under "nothing at all": a way forward, such as Try again. */
  emptyAction?: ReactNode;
  /** Before each label, such as a channel's "#". */
  prefix?: string;
  /** Said when the list has nothing at all. */
  empty: string;
  noMatch: (query: string) => string;
  error?: string | null;
  /** Each picked option's Remove button's name, with `multiple`. */
  removeLabel?: (name: string) => string;
  searchRef?: Ref<HTMLInputElement>;
  testId: string;
}

/**
 * A searchable list of choices: a labelled search field over a short
 * scrolling list of native radios (one) or checkboxes (several), so it
 * works from the keyboard as any form does (Tab in, arrows between radios,
 * Space to tick). Several picked show as chips above, each with Remove
 * (focus goes back to the search, as in the Share window's invite chips).
 * The single choice's highlight glides to the one picked (jumps with reduced
 * motion); it's a fill, not a ring, so it never reads as keyboard focus.
 * Enter in the search picks its first match (ticks the first not yet ticked,
 * with several) and never submits the form. How many match, nothing
 * matching, the limit, a pick from the search and a removal are read out.
 */
export function ClickUpPicker({
  label,
  searchPlaceholder,
  options,
  multiple = false,
  value,
  onChange,
  max,
  noneLabel,
  aside,
  hint,
  busy = false,
  required = false,
  emptyAction,
  prefix = "",
  empty,
  noMatch,
  error = null,
  removeLabel,
  searchRef,
  testId,
}: ClickUpPickerProps) {
  const reduce = useReducedMotion();
  const variants = usePopVariants();
  const searchId = useId();
  const labelId = useId();
  const listId = useId();
  const errorId = useId();
  const hintId = useId();
  const name = useId();
  const [query, setQuery] = useState("");
  /** What the last chip removal said, until the next change. */
  const [announcement, setAnnouncement] = useState("");
  const { shown, more } = filterClickUpOptions(options, query);
  const picked = new Set(value);
  const full = multiple && max !== undefined && value.length >= max.count;
  const chips = multiple ? options.filter((option) => picked.has(option.id)) : [];
  const typed = query.trim();

  const toggle = (id: string) => {
    setAnnouncement("");
    if (!multiple) {
      onChange(id ? [id] : []);
      return;
    }
    onChange(picked.has(id) ? value.filter((item) => item !== id) : [...value, id]);
  };

  /** The match Enter picks: the first, or with several the first not yet ticked (none once full). */
  const firstMatch = (): ClickUpOption | undefined => {
    if (!multiple) return shown[0];
    return full ? undefined : shown.find(({ id }) => !picked.has(id));
  };

  /** Enter in the search: the first match is picked, as a combobox would, and nothing is sent. */
  const pickFirst = (event: KeyboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    if (event.nativeEvent.isComposing || !typed) return;
    const first = firstMatch();
    if (!first || picked.has(first.id)) return;
    toggle(first.id);
    setAnnouncement(CLICKUP_SEND_COPY.picked(`${prefix}${first.label}`));
  };

  /** A chip's Remove: its button goes with it, so focus moves to the search, as in Share. */
  const removeChip = (chip: ClickUpOption) => {
    onChange(value.filter((item) => item !== chip.id));
    setAnnouncement(CLICKUP_SEND_COPY.removed(chip.label));
    document.getElementById(searchId)?.focus();
  };

  const row = (option: ClickUpOption, selected: boolean, disabled: boolean) => (
    <label
      key={option.id || "none"}
      data-testid={`${testId}-option`}
      data-selected={selected || undefined}
      className={`relative flex min-h-11 items-center gap-3 rounded-tile px-3 py-2 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-focus ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-hover"
      } ${selected && multiple ? "bg-brand-soft" : ""}`}
    >
      {selected && !multiple ? (
        <motion.span
          layoutId={`${name}-picked`}
          transition={reduce ? instant : spring.snappy}
          // A fill only: a ring here would look just like the focus outline (both the brand blue).
          className="pointer-events-none absolute inset-0 rounded-tile bg-brand-soft"
        />
      ) : null}
      <input
        type={multiple ? "checkbox" : "radio"}
        name={name}
        value={option.id}
        checked={selected}
        disabled={disabled}
        required={required && !multiple}
        onChange={() => toggle(option.id)}
        className="sr-only"
      />
      {/* A mark, so a choice reads without telling the colors apart (WCAG 1.4.1). */}
      <span
        aria-hidden="true"
        className={`relative grid size-5 shrink-0 place-items-center ring-2 ring-inset ${
          multiple ? "rounded-kbd" : "rounded-pill"
        } ${selected ? "bg-brand-text ring-brand-text text-card" : "ring-field-line"}`}
      >
        {selected && multiple ? <Icon name="check" className="size-3.5" /> : null}
        {selected && !multiple ? <span className="size-2 rounded-pill bg-card" /> : null}
      </span>
      <span className="relative flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body font-semibold">
          {option.id ? prefix : ""}
          {option.label}
        </span>
        {option.detail ? (
          <span className="truncate text-meta text-muted">{option.detail}</span>
        ) : null}
      </span>
    </label>
  );

  const nothing = options.length === 0;
  const status = nothing ? empty : shown.length === 0 ? noMatch(typed) : null;
  // Read out as the search narrows the list (the status line in the list isn't live), with the
  // limit once it's reached and a chip just removed.
  const spoken = [
    typed ? (shown.length ? CLICKUP_SEND_COPY.matches(shown.length + more) : status) : "",
    full && max ? max.message : "",
    announcement,
  ]
    .filter(Boolean)
    .join(" ");
  const note = required ? CLICKUP_SEND_COPY.required : aside;
  const described = hint ? `${hintId} ${errorId}` : errorId;
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={described}
      className="flex min-w-0 flex-col gap-2"
      data-testid={testId}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <label id={labelId} htmlFor={searchId} className="text-body font-semibold">
            {label}
          </label>
          {note ? <span className="shrink-0 text-meta text-muted">{note}</span> : null}
        </div>
        {hint ? (
          <p
            id={hintId}
            className="text-meta text-pretty text-muted"
            data-testid={`${testId}-hint`}
          >
            {hint}
          </p>
        ) : null}
      </div>
      {chips.length ? (
        <ul aria-label={label} className="flex flex-wrap gap-2">
          <AnimatePresence initial={false}>
            {chips.map((chip) => (
              <motion.li
                key={chip.id}
                layout
                variants={variants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={reduce ? instant : spring.snappy}
                className="flex max-w-full min-w-0 items-center gap-1 rounded-pill bg-brand-soft py-1 pr-1 pl-3 text-body font-semibold text-brand-text"
                data-testid={`${testId}-chip`}
              >
                <span className="truncate">{chip.label}</span>
                <button
                  type="button"
                  onClick={() => removeChip(chip)}
                  aria-label={removeLabel?.(chip.label) ?? chip.label}
                  className="-my-2 grid size-11 shrink-0 place-items-center rounded-pill transition-colors hover:bg-hover active:bg-seg"
                >
                  <Icon name="close" className="size-4" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : null}
      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted"
        />
        <input
          ref={searchRef}
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setAnnouncement("");
          }}
          onKeyDown={(event) => {
            // Escape clears what's typed first (the window lets it, `data-popup-open`); the next closes it.
            if (event.key === "Escape" && query) setQuery("");
            if (event.key === "Enter") pickFirst(event);
          }}
          placeholder={searchPlaceholder}
          autoComplete="off"
          spellCheck={false}
          // Nothing to search: the list says why underneath.
          disabled={nothing}
          aria-controls={listId}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          className={`${FIELD_CLASS} pl-10`}
          data-testid={`${testId}-search`}
          {...(query ? { "data-popup-open": true } : {})}
        />
      </div>
      {/*
       * Its own scroll, kept from scrolling the window once it reaches an end (overscroll), and
       * measured by `layoutScroll` so the picked highlight glides true after scrolling.
       */}
      <motion.div
        id={listId}
        layoutScroll
        aria-busy={busy || undefined}
        data-busy={busy || undefined}
        className="flex max-h-52 flex-col gap-1 overflow-y-auto overscroll-contain rounded-field bg-card p-1 ring-1 ring-line ring-inset"
      >
        {noneLabel && !typed ? row({ id: "", label: noneLabel }, value.length === 0, false) : null}
        {shown.map((option) => {
          const selected = picked.has(option.id);
          return row(option, selected, full && !selected);
        })}
        {status ? (
          <p className="px-3 py-2 text-meta text-muted" data-testid={`${testId}-status`}>
            {status}
          </p>
        ) : null}
        {nothing && emptyAction ? <div className="px-3 pb-2">{emptyAction}</div> : null}
        {more ? (
          <p className="px-3 py-2 text-meta text-muted">{CLICKUP_SEND_COPY.more(more)}</p>
        ) : null}
      </motion.div>
      <p role="status" className="sr-only">
        {spoken}
      </p>
      {full && max ? <p className="text-meta text-muted">{max.message}</p> : null}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
