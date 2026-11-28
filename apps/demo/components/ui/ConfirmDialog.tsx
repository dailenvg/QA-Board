"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { FormAlert } from "../auth/FormAlert";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { FieldError } from "./FieldError";
import { FIELD_CLASS } from "./field-styles";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  /**
   * Text that must be typed before confirming (such as a folder's name), for
   * deletes that can't be undone and lose other people's work. Null or absent:
   * a plain confirm.
   */
  confirmText?: string | null;
  /**
   * The confirmed change is on its way, for a confirm that waits for the
   * server: `pendingLabel` replaces the confirm's words, both buttons are
   * read-only, and the dialog stays up until it's answered.
   */
  pending?: boolean;
  pendingLabel?: string;
  /** Why the last try didn't work (a plain confirm's), shown in the dialog; confirming tries again. */
  error?: string | null;
  /**
   * Trying again can't work (a plain confirm's, refused for good, as `error`
   * says): the confirm stays focusable but does nothing; Cancel still closes.
   */
  confirmDisabled?: boolean;
  /**
   * The confirm button's look: `danger` (the default) for what loses or takes
   * away something, `primary` for a change that isn't data loss but still asks
   * first, such as showing a team-only comment to clients. Cancel keeps the
   * first focus either way.
   */
  confirmVariant?: "danger" | "primary";
}

/**
 * Confirmation before a change that can't be taken lightly, destructive by
 * default. Cancel is focused first so Enter never confirms by accident; with
 * `confirmText`, the field to type it in is, and Enter deletes only once it
 * matches.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  confirmText = null,
  pending = false,
  pendingLabel,
  error = null,
  confirmDisabled = false,
  confirmVariant = "danger",
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      dismissible={!pending}
    >
      {confirmText ? (
        <TypedConfirm
          key={confirmText}
          text={confirmText}
          confirmLabel={confirmLabel}
          onConfirm={onConfirm}
          onClose={onClose}
        />
      ) : (
        // aria-busy while it's sent, as the project's other waiting forms do (DeleteAccountDialog).
        <div aria-busy={pending || undefined}>
          <FormAlert message={error} className="has-[p]:mb-4" testId="confirm-error" />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {/* aria-disabled while it's sent: still focusable, so focus never drops to the page. */}
            <Button
              variant="secondary"
              onClick={pending ? undefined : onClose}
              aria-disabled={pending || undefined}
              data-autofocus
            >
              Cancel
            </Button>
            <Button
              variant={confirmVariant}
              onClick={pending || confirmDisabled ? undefined : onConfirm}
              aria-disabled={pending || confirmDisabled || undefined}
            >
              {pending && pendingLabel ? pendingLabel : confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function TypedConfirm({
  text,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = useId();
  const matches = value.trim() === text.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (matches) {
      onConfirm();
      return;
    }
    setError(`That doesn't match. Type ${text} to confirm.`);
    input.current?.focus();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div>
        <label htmlFor={inputId} className="mb-2 block text-body font-semibold">
          Type <span className="font-bold break-all">{text}</span> to confirm
        </label>
        <input
          ref={input}
          id={inputId}
          data-autofocus
          value={value}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          data-testid="confirm-text"
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          className={FIELD_CLASS}
        />
        <FieldError id={errorId} message={error} />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        {/* aria-disabled, not disabled: it stays focusable, and a press explains what's missing. */}
        <Button type="submit" variant="danger" aria-disabled={matches ? undefined : true}>
          {confirmLabel}
        </Button>
      </div>
    </form>
  );
}
