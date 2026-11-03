"use client";

import { useId, type Ref } from "react";
import { FieldError } from "../ui/FieldError";
import { FIELD_CLASS } from "../ui/field-styles";

interface AuthFieldProps {
  label: string;
  type: "email" | "password";
  autoComplete: "username" | "email" | "current-password" | "new-password";
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  /** Validates when focus leaves the field. */
  onBlur: () => void;
  hint?: string;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
  testId?: string;
}

/** A labelled email or password input with its hint and inline error. */
export function AuthField({
  label,
  type,
  autoComplete,
  value,
  error,
  onChange,
  onBlur,
  hint,
  inputRef,
  autoFocus = false,
  testId,
}: AuthFieldProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  return (
    <div>
      <label htmlFor={inputId} className="mb-2 block text-body font-semibold">
        {label}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type={type}
        name={autoComplete === "new-password" ? undefined : type}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        inputMode={type === "email" ? "email" : undefined}
        required
        // Only on pages that are nothing but this form.
        autoFocus={autoFocus}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint ? `${hintId} ${errorId}` : errorId}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        data-testid={testId}
        className={FIELD_CLASS}
      />
      {hint ? (
        <p id={hintId} className="mt-2 text-meta text-muted">
          {hint}
        </p>
      ) : null}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
