"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { instant, spring, usePopVariants } from "@/lib/motion";
import { MAX_INVITES_PER_SEND } from "@/lib/share/invite-addresses";
import { FieldError } from "../ui/FieldError";
import { Icon } from "../ui/Icon";
import { addChips, chipLabel, chipsMessage, removeChip, type InviteChip } from "./invite-chips";

interface InviteChipsFieldProps {
  chips: InviteChip[];
  onChange: (chips: InviteChip[]) => void;
  /** Busy sending: the chips stay, and nothing can be added or removed. */
  readOnly: boolean;
}

/** Keys that end an address: it becomes a chip. Tab only with text typed, so focus can still move. */
const SPLIT_KEYS = new Set(["Enter", ",", " ", ";"]);

/**
 * "Email them the link": addresses typed or pasted become chips. Enter,
 * comma, space, semicolon and Tab (with text typed) end one; a paste splits
 * on its own; Backspace in an empty field takes the last chip back. Each
 * chip has its own Remove button. A chip that isn't an address (checked as
 * it's added, and as the field loses focus) is marked, and said under the
 * field. At most `MAX_INVITES_PER_SEND`.
 */
export function InviteChipsField({ chips, onChange, readOnly }: InviteChipsFieldProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [overflow, setOverflow] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const variants = usePopVariants();
  const reduce = useReducedMotion();
  const full = chips.length >= MAX_INVITES_PER_SEND;
  const message = chipsMessage(chips, overflow);

  const commit = (text: string) => {
    if (!text.trim()) return;
    const next = addChips(chips, text);
    setDraft("");
    setOverflow(next.overflow);
    if (next.added.length) {
      onChange(next.chips);
      const count = next.chips.length;
      setAnnouncement(
        `Added ${next.added.join(", ")}. ${count} ${count === 1 ? "recipient" : "recipients"}.`,
      );
    }
  };

  const remove = (address: string, refocus: boolean) => {
    const next = removeChip(chips, address);
    onChange(next);
    setOverflow(0);
    setAnnouncement(`Removed ${address}.`);
    if (refocus) input.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (readOnly) return;
    const typed = draft.trim() !== "";
    if (SPLIT_KEYS.has(event.key) || (event.key === "Tab" && !event.shiftKey && typed)) {
      if (!typed && event.key !== "Enter") return;
      event.preventDefault();
      commit(draft);
      return;
    }
    const last = chips[chips.length - 1];
    if (event.key === "Backspace" && draft === "" && last) {
      event.preventDefault();
      remove(last.address, false);
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (!/[\s,;]/.test(text.trim())) return;
    event.preventDefault();
    commit(`${draft} ${text}`);
  };

  return (
    <div className="flex flex-col">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="text-body font-semibold">
          Email them the link
        </label>
        <span id={hintId} className="shrink-0 text-meta text-muted">
          Up to {MAX_INVITES_PER_SEND} at a time
        </span>
      </div>
      {/* The box focuses its field on a click anywhere inside it, as a text field would. */}
      <div
        onClick={() => input.current?.focus()}
        className={`flex min-h-12 cursor-text flex-wrap items-center gap-2 rounded-field pointer-coarse:gap-y-4 bg-card p-2 ring-1 ring-field-line transition-shadow ring-inset hover:ring-ink-2 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-focus ${
          message ? "ring-2 ring-danger" : ""
        }`}
      >
        <ul aria-label="Recipients" className="contents">
          <AnimatePresence initial={false}>
            {chips.map((chip) => (
              <motion.li
                key={chip.address}
                layout
                variants={variants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={reduce ? instant : spring.snappy}
                data-testid="invite-chip"
                data-problem={chip.problem ?? undefined}
                className={`flex max-w-full min-w-0 items-center gap-1 rounded-pill py-1 pr-1 pl-3 text-body font-semibold ${
                  chip.problem
                    ? "bg-danger-soft text-danger ring-1 ring-danger ring-inset"
                    : "bg-brand-soft text-brand-text"
                }`}
              >
                {chip.problem ? <Icon name="alert" className="size-3.5 shrink-0" /> : null}
                <span className="min-w-0 truncate" title={chip.address}>
                  <span className="sr-only">{chipLabel(chip)}</span>
                  <span aria-hidden="true">{chip.address}</span>
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!readOnly) remove(chip.address, true);
                  }}
                  aria-disabled={readOnly || undefined}
                  aria-label={`Remove ${chip.address}`}
                  // 36px under a mouse; a thumb gets 44px, the rows spread to keep the targets apart.
                  className="-my-2 grid size-9 shrink-0 place-items-center rounded-pill transition-colors hover:bg-card/70 focus-visible:-outline-offset-2 active:bg-card aria-disabled:cursor-not-allowed aria-disabled:opacity-50 pointer-coarse:-my-3 pointer-coarse:size-11"
                >
                  <Icon name="close" className="size-3.5" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <input
          ref={input}
          id={inputId}
          type="text"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={draft}
          readOnly={readOnly}
          placeholder={full ? "" : "Add an email and press Enter"}
          aria-describedby={`${hintId} ${errorId}`}
          aria-invalid={message ? true : undefined}
          onChange={(event) => {
            const value = event.target.value;
            // A comma or semicolon typed (or dropped) ends the address before it.
            if (/[,;]/.test(value)) commit(value);
            else setDraft(value);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => commit(draft)}
          data-testid="invite-input"
          className="min-h-9 min-w-40 flex-1 bg-transparent px-2 text-nav text-ink placeholder:text-muted focus:outline-none"
        />
      </div>
      <FieldError id={errorId} message={message} />
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
