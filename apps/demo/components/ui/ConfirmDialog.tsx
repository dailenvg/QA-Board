"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
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
}

/**
 * Destructive confirmation. Cancel is focused first so Enter never deletes by
 * accident; with `confirmText`, the field to type it in is, and Enter deletes
 * only once it matches.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  confirmText = null,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} size="sm">
      {confirmText ? (
        <TypedConfirm
          key={confirmText}
          text={confirmText}
          confirmLabel={confirmLabel}
          onConfirm={onConfirm}
          onClose={onClose}
        />
      ) : (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} data-autofocus>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
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
