"use client";

import { useId } from "react";
import { FieldError } from "../ui/FieldError";
import { FIELD_CLASS } from "../ui/field-styles";

interface UrlFieldProps {
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  /** Validates and normalizes (for example adds https://) when focus leaves the field. */
  onBlur: () => void;
}

export function UrlField({ value, error, onChange, onBlur }: UrlFieldProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  return (
    <div>
      <label htmlFor={inputId} className="mb-2 block text-body font-semibold">
        Website address
      </label>
      <input
        id={inputId}
        data-autofocus
        type="url"
        required
        inputMode="url"
        autoComplete="url"
        spellCheck={false}
        placeholder="example.com"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${hintId} ${errorId}`}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className={FIELD_CLASS}
      />
      <p id={hintId} className="mt-2 text-meta text-muted">
        Some sites block embedding. If so, you can upload a screenshot instead.
      </p>
      <FieldError id={errorId} message={error} />
    </div>
  );
}
