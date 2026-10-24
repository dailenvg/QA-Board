"use client";

import { motion } from "motion/react";
import { useId, useState, type FormEvent, type KeyboardEvent, type Ref } from "react";
import { usePopVariants } from "@/lib/motion";
import { useMediaQuery } from "@/lib/use-media-query";
import { SHARE_LIMITS } from "@/lib/share/limits";
import { Button } from "../ui/Button";
import { FieldError } from "../ui/FieldError";
import { Icon } from "../ui/Icon";
import { FIELD_CLASS } from "../ui/field-styles";
import type { Draft } from "./types";

interface ComposerProps {
  draft: Draft;
  authorName: string | null;
  textareaRef: Ref<HTMLTextAreaElement>;
  onChange: (body: string) => void;
  onSubmit: (body: string, author: string) => void;
  onCancel: () => void;
}

const NAME_MISSING = "Add your name so others know who commented.";

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
  onSubmit,
  onCancel,
}: ComposerProps) {
  const docked = !useMediaQuery("(min-width: 640px)");
  const variants = usePopVariants();
  const [author, setAuthor] = useState(authorName ?? "");
  const [editingName, setEditingName] = useState(!authorName);
  const [error, setError] = useState<{ field: "name" | "body"; message: string } | null>(null);
  const titleId = useId();
  const nameId = useId();
  const nameErrorId = useId();
  const bodyId = useId();
  const errorId = useId();
  const sendErrorId = useId();
  const cancelHintId = useId();
  const nameError = error?.field === "name" ? error.message : null;
  const bodyError = error?.field === "body" ? error.message : null;

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
      className={`z-40 rounded-card bg-panel p-4 shadow-pop ring-1 ring-line ${
        docked
          ? "fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))]"
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
              autoFocus={!authorName}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameErrorId}
              onChange={(event) => {
                setAuthor(event.target.value);
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
            ref={textareaRef}
            value={draft.body}
            rows={3}
            maxLength={SHARE_LIMITS.body}
            required
            autoFocus={Boolean(authorName)}
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
          <div className="flex gap-2">
            {/*
             * While posting, Cancel waits: a cancelled draft must never still arrive.
             * If the post fails, Cancel discards it as usual.
             */}
            <Button
              variant="ghost"
              size="sm"
              aria-disabled={draft.sending || undefined}
              aria-describedby={draft.sending ? cancelHintId : undefined}
              onClick={draft.sending ? undefined : onCancel}
            >
              Cancel
            </Button>
            {draft.sending ? (
              <span id={cancelHintId} className="sr-only">
                Wait for the comment to finish posting.
              </span>
            ) : null}
            {/* aria-disabled, not disabled: focus stays put, so Retry is right here on failure. */}
            <Button
              type="submit"
              size="sm"
              aria-disabled={draft.sending || undefined}
              aria-busy={draft.sending || undefined}
              aria-describedby={draft.error ? sendErrorId : undefined}
            >
              {draft.sending ? "Posting…" : draft.error ? "Retry" : "Post"}
            </Button>
          </div>
        </div>
      </form>
    </motion.div>
  );
}
