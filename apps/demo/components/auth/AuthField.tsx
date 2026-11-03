"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId, useState, type Ref } from "react";
import { press } from "@/lib/motion";
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
  const reduce = useReducedMotion();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  return (
    <div>
      <label htmlFor={inputId} className="mb-2 block text-body font-semibold">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type={isPassword && revealed ? "text" : type}
          // From the field's kind, not the rendered type, so showing the password keeps its name.
          name={autoComplete === "new-password" ? undefined : type}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
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
          // pr-20 keeps typed text clear of the Show button.
          className={`${FIELD_CLASS} ${isPassword ? "pr-20" : ""}`}
        />
        {isPassword ? (
          // Named by its text ("Show password" / "Hide password"), not aria-label, so
          // getByLabel("Password") still finds only the input. It stays mounted, so focus stays.
          // Press only, no hover grow: it sits flush inside the field's edge.
          <motion.button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            aria-controls={inputId}
            className="absolute inset-y-0 right-0 inline-flex min-w-11 items-center justify-center rounded-field px-4 text-body font-semibold text-brand-text transition-colors select-none hover:bg-brand-soft focus-visible:-outline-offset-2 active:bg-brand-soft"
            {...(reduce ? {} : { whileTap: press.whileTap, transition: press.transition })}
          >
            {revealed ? "Hide" : "Show"}
            <span className="sr-only"> password</span>
          </motion.button>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="mt-2 text-meta text-muted">
          {hint}
        </p>
      ) : null}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
