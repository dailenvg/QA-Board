"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { FieldError } from "./FieldError";
import { FIELD_CLASS } from "./field-styles";

interface PromptDialogProps {
  open: boolean;
  title: string;
  label: string;
  initialValue?: string;
  submitLabel: string;
  /** Returns an error message to keep the dialog open, or null when done. */
  onSubmit: (value: string) => string | null;
  onClose: () => void;
  testId?: string;
}

/** Single-field form in a dialog, used for naming folders and projects. */
export function PromptDialog(props: PromptDialogProps) {
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      size="sm"
      testId={props.testId}
    >
      <PromptForm {...props} />
    </Dialog>
  );
}

function PromptForm({
  label,
  initialValue = "",
  submitLabel,
  onSubmit,
  onClose,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) {
      setError("Enter a name.");
      return;
    }
    setError(onSubmit(value));
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div>
        <label htmlFor={inputId} className="mb-2 block text-body font-semibold">
          {label}
        </label>
        <input
          id={inputId}
          data-autofocus
          value={value}
          maxLength={80}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          onFocus={(event) => event.currentTarget.select()}
          className={FIELD_CLASS}
        />
        <FieldError id={errorId} message={error} />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
