"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { instant, spring } from "@/lib/motion";
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
  /** The picked option's id, or null. */
  value: string | null;
  onChange: (id: string | null) => void;
  /** A first radio that picks nobody, for a choice that can be left out. */
  noneLabel?: string;
  /** Beside the label, such as "Optional". */
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
  searchRef?: Ref<HTMLInputElement>;
  testId: string;
}

/**
 * A searchable list of choices: a labelled search field over a short
 * scrolling list of native radios, so it works from the keyboard as any
 * form does (Tab in, arrows between radios). The highlight glides to the
 * one picked (jumps with reduced motion); it's a fill, not a ring, so it
 * never reads as keyboard focus. Enter in the search picks its first match
 * and never submits the form. How many match, nothing matching and a pick
 * from the search are read out.
 */
export function ClickUpPicker({
  label,
  searchPlaceholder,
  options,
  value,
  onChange,
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
  searchRef,
  testId,
}: ClickUpPickerProps) {
  const reduce = useReducedMotion();
  const searchId = useId();
  const labelId = useId();
  const listId = useId();
  const errorId = useId();
  const hintId = useId();
  const name = useId();
  const [query, setQuery] = useState("");
  /** What a pick from the search said, until the next change. */
  const [announcement, setAnnouncement] = useState("");
  const { shown, more } = filterClickUpOptions(options, query);
  const typed = query.trim();

  const pick = (id: string) => {
    setAnnouncement("");
    onChange(id || null);
  };

  /** Enter in the search: the first match is picked, as a combobox would, and nothing is sent. */
  const pickFirst = (event: KeyboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    if (event.nativeEvent.isComposing || !typed) return;
    const [first] = shown;
    if (!first || first.id === value) return;
    pick(first.id);
    setAnnouncement(CLICKUP_SEND_COPY.picked(`${prefix}${first.label}`));
  };

  const row = (option: ClickUpOption, selected: boolean) => (
    <label
      key={option.id || "none"}
      data-testid={`${testId}-option`}
      data-selected={selected || undefined}
      className="relative flex min-h-11 cursor-pointer items-center gap-3 rounded-tile px-3 py-2 hover:bg-hover has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-focus"
    >
      {selected ? (
        <motion.span
          layoutId={`${name}-picked`}
          transition={reduce ? instant : spring.snappy}
          // A fill only: a ring here would look just like the focus outline (both the brand blue).
          className="pointer-events-none absolute inset-0 rounded-tile bg-brand-soft"
        />
      ) : null}
      <input
        type="radio"
        name={name}
        value={option.id}
        checked={selected}
        required={required}
        onChange={() => pick(option.id)}
        className="sr-only"
      />
      {/* A mark, so a choice reads without telling the colors apart (WCAG 1.4.1). */}
      <span
        aria-hidden="true"
        className={`relative grid size-5 shrink-0 place-items-center rounded-pill ring-2 ring-inset ${
          selected ? "bg-brand-text ring-brand-text" : "ring-field-line"
        }`}
      >
        {selected ? <span className="size-2 rounded-pill bg-card" /> : null}
      </span>
      <span className="relative flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body font-semibold">
          {option.id ? prefix : ""}
          {option.label}
        </span>
        {option.detail ? (
          // Darker on the picked row: its fill under the hover tint leaves muted text below 4.5:1.
          <span className={`truncate text-meta ${selected ? "text-ink-2" : "text-muted"}`}>
            {option.detail}
          </span>
        ) : null}
      </span>
    </label>
  );

  const nothing = options.length === 0;
  const status = nothing ? empty : shown.length === 0 ? noMatch(typed) : null;
  // Read out as the search narrows the list (the status line in the list isn't live), and a pick
  // from the search.
  const spoken = [
    typed ? (shown.length ? CLICKUP_SEND_COPY.matches(shown.length + more) : status) : "",
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
        {noneLabel && !typed ? row({ id: "", label: noneLabel }, value === null) : null}
        {shown.map((option) => row(option, option.id === value))}
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
      <FieldError id={errorId} message={error} />
    </div>
  );
}
