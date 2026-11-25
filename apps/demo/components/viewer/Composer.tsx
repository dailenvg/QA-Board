"use client";

import { AnimatePresence, motion, useIsPresent } from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { fadeOnly, usePopVariants } from "@/lib/motion";
import { useDockAboveKeyboard } from "@/lib/use-fit-above-keyboard";
import { useMediaQuery } from "@/lib/use-media-query";
import { SHARE_LIMITS } from "@/lib/share/limits";
import type { CommentPriority } from "@/lib/store/types";
import { Button } from "../ui/Button";
import { FieldError } from "../ui/FieldError";
import { Icon } from "../ui/Icon";
import { FIELD_CLASS } from "../ui/field-styles";
import { PriorityField } from "./PriorityField";
import type { Draft } from "./types";

interface ComposerProps {
  draft: Draft;
  authorName: string | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (body: string) => void;
  /** The name as it's typed, so it stays with the draft. */
  onAuthorChange: (author: string) => void;
  /** The priority as it's picked (missing for none), so it stays with the draft. */
  onPriorityChange: (priority: CommentPriority | undefined) => void;
  onSubmit: (body: string, author: string) => void;
  onCancel: () => void;
}

const NAME_MISSING = "Add your name so others know who commented.";

/**
 * The docked composer's cap (`max-h-[calc(100dvh-1.5rem)]`, its 12px inset above and below),
 * which the keyboard can only lower. With a name field and Priority it can outgrow a short phone
 * screen once the keyboard is up; it then scrolls, so Priority and Post stay reachable.
 */
const DOCKED_MAX = "calc(100dvh - 1.5rem)";

/**
 * A send still busy after this long says it's taking longer than usual: about when waiting
 * stops holding attention. A UI threshold only; the send's own retries and timeouts are `sendDraft`'s.
 */
const SLOW_SEND_MS = 10_000;
const SLOW_SEND = "Taking longer than usual. Keep this page open until your comment is posted.";

/** Send's label: what it's doing while busy (a screenshot that needed another try says so). */
function sendLabel({ sending, error }: Draft): string {
  if (sending === "screenshot") return "Adding screenshot…";
  if (sending) return "Posting…";
  return error ? "Retry" : "Post";
}

/** Popover placement: flip left near the right edge and upward near the bottom. */
function placement({ x, y }: Draft): string {
  const horizontal = x > 60 ? "calc(-100% - 0.5rem)" : "2.75rem";
  const vertical = y > 55 ? "calc(-100% + 0.5rem)" : "-2.25rem";
  return `${horizontal} ${vertical}`;
}

/**
 * New-comment popover anchored to the draft pin (docked to the bottom on small
 * screens). Enter posts, Shift+Enter adds a line, Escape cancels.
 */
export function Composer({
  draft,
  authorName,
  textareaRef,
  onChange,
  onAuthorChange,
  onPriorityChange,
  onSubmit,
  onCancel,
}: ComposerProps) {
  const docked = !useMediaQuery("(min-width: 640px)");
  const variants = usePopVariants();
  const present = useIsPresent();
  const dockRef = useRef<HTMLDivElement>(null);
  // Docked, the composer sits at the bottom of the screen, where a phone's keyboard opens.
  useDockAboveKeyboard(dockRef, docked, DOCKED_MAX);
  // A composer fading out can outlive the next one's mount: it only clears the ref if it still holds its own.
  const attachTextarea = useCallback(
    (node: HTMLTextAreaElement | null) => {
      textareaRef.current = node;
      return () => {
        if (textareaRef.current === node) textareaRef.current = null;
      };
    },
    [textareaRef],
  );
  const [author, setAuthor] = useState(draft.author ?? authorName ?? "");
  const [editingName, setEditingName] = useState(!authorName);
  const [error, setError] = useState<{ field: "name" | "body"; message: string } | null>(null);
  const titleId = useId();
  const nameId = useId();
  const nameErrorId = useId();
  const bodyId = useId();
  const errorId = useId();
  const sendErrorId = useId();
  const cancelHintId = useId();
  const sending = draft.sending !== false;
  const nameError = error?.field === "name" ? error.message : null;
  const bodyError = error?.field === "body" ? error.message : null;

  // A long send (a slow or stalled network can take minutes before Retry) says it's still going.
  const [slow, setSlow] = useState(false);
  if (slow && !sending) setSlow(false);
  useEffect(() => {
    if (!sending) return;
    const timer = window.setTimeout(() => setSlow(true), SLOW_SEND_MS);
    return () => window.clearTimeout(timer);
  }, [sending]);
  /**
   * What screen readers hear: the send starting, a screenshot retry, and then that it's slow,
   * said once instead of at every step after. Focus often stays in the comment field (Enter posts), where
   * Send's label changes aren't read.
   */
  const status = !sending ? "" : slow ? SLOW_SEND : sendLabel(draft);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (draft.sending) return;
    if (!author.trim()) {
      setEditingName(true);
      setError({ field: "name", message: NAME_MISSING });
      return;
    }
    if (!draft.body.trim()) {
      setError({ field: "body", message: "Write a comment first." });
      return;
    }
    onSubmit(draft.body, author);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!draft.sending) onCancel();
    } else if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement)
    ) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <motion.div
      ref={dockRef}
      role="dialog"
      aria-labelledby={titleId}
      data-testid="composer"
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={(event) => event.stopPropagation()}
      style={
        docked
          ? undefined
          : { left: `${draft.x}%`, top: `${draft.y}%`, translate: placement(draft) }
      }
      className={`z-40 rounded-card bg-panel ${present ? "pointer-events-auto" : "pointer-events-none"} p-4 shadow-pop ring-1 ring-line ${
        docked
          ? "fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain"
          : "absolute w-76"
      }`}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3" onKeyDown={onKeyDown}>
        <h2 id={titleId} className="text-body font-bold">
          New comment
        </h2>
        {editingName ? (
          <div>
            <label htmlFor={nameId} className="mb-1 block text-meta font-semibold">
              Your name
            </label>
            <input
              id={nameId}
              value={author}
              maxLength={80}
              required
              autoComplete="name"
              // Whenever it appears: on a first visit, after Change (whose button it
              // replaces, so focus would drop to the page), and when a post finds no name.
              autoFocus
              // The post already carries the name: a change typed now would be lost.
              readOnly={sending}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameErrorId}
              onChange={(event) => {
                setAuthor(event.target.value);
                onAuthorChange(event.target.value);
                setError((current) => (current?.field === "name" ? null : current));
              }}
              onBlur={() => {
                if (!author.trim()) setError({ field: "name", message: NAME_MISSING });
              }}
              className={FIELD_CLASS}
            />
            <FieldError id={nameErrorId} message={nameError} />
          </div>
        ) : (
          <p className="text-meta text-muted">
            Posting as <span className="font-semibold text-ink">{author}</span>
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="ml-1 inline-flex min-h-11 items-center rounded-kbd px-1 font-semibold text-brand-text hover:underline active:opacity-70"
            >
              Change
            </button>
          </p>
        )}
        <div>
          <label htmlFor={bodyId} className="mb-1 block text-meta font-semibold">
            Comment
          </label>
          <textarea
            id={bodyId}
            ref={attachTextarea}
            value={draft.body}
            rows={3}
            maxLength={SHARE_LIMITS.body}
            required
            autoFocus={Boolean(authorName)}
            // The post already carries the text: words typed while it's sent would be lost.
            readOnly={sending}
            placeholder="What should change here?"
            aria-invalid={bodyError ? true : undefined}
            aria-describedby={errorId}
            onChange={(event) => {
              onChange(event.target.value);
              setError((current) => (current?.field === "body" ? null : current));
            }}
            className={`${FIELD_CLASS} resize-none py-2`}
          />
          <FieldError id={errorId} message={bodyError} />
          <p className="mt-2 hidden text-label text-muted sm:block">
            Enter to post · Shift+Enter for a new line
          </p>
        </div>
        <PriorityField
          value={draft.priority}
          // The post already carries the priority: one picked while it's sent would be lost.
          onChange={(priority) => {
            if (!sending) onPriorityChange(priority);
          }}
        />
        {/* Always present, so each change is announced (a region added with its words isn't). */}
        <p role="status" className="sr-only" data-testid="composer-status">
          {status}
        </p>
        {/* Hidden from screen readers: the status above has said it. */}
        <AnimatePresence initial={false}>
          {slow ? (
            <motion.p
              key="slow"
              aria-hidden="true"
              data-testid="composer-slow"
              variants={fadeOnly}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="flex items-start gap-2 text-meta text-muted"
            >
              <Icon name="clock" className="mt-0.5 size-4 shrink-0" />
              {SLOW_SEND}
            </motion.p>
          ) : null}
        </AnimatePresence>
        {draft.error ? (
          <p
            id={sendErrorId}
            role="alert"
            data-testid="composer-send-error"
            className="flex items-start gap-2 rounded-field bg-danger-soft px-3 py-2 text-meta font-semibold text-danger"
          >
            <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
            {draft.error}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          {/*
           * Wraps rather than squeezing Send into a two-line pill if a busy label such as
           * "Adding screenshot…" and Cancel don't fit on one row (the 304px popover, or the docked
           * composer on a narrow phone).
           */}
          <div className="flex flex-wrap justify-end gap-2">
            {/*
             * While posting, Cancel waits: a cancelled draft must never still arrive.
             * If the post fails, Cancel discards it as usual.
             */}
            <Button
              variant="ghost"
              size="sm"
              aria-disabled={sending || undefined}
              aria-describedby={sending ? cancelHintId : undefined}
              onClick={sending ? undefined : onCancel}
            >
              Cancel
            </Button>
            {sending ? (
              <span id={cancelHintId} className="sr-only">
                Wait for the comment to finish posting.
              </span>
            ) : null}
            {/* aria-disabled, not disabled: focus stays put, so Retry is right here on failure. */}
            <Button
              type="submit"
              size="sm"
              className="whitespace-nowrap"
              aria-disabled={sending || undefined}
              aria-busy={sending || undefined}
              aria-describedby={draft.error ? sendErrorId : undefined}
            >
              {sendLabel(draft)}
            </Button>
          </div>
        </div>
      </form>
    </motion.div>
  );
}
