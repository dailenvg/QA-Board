"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId, type ReactNode, type Ref } from "react";
import { press } from "@/lib/motion";
import { FieldError } from "../ui/FieldError";
import { FIELD_CLASS } from "../ui/field-styles";
import { useReportedReveal } from "./password-reveal";

interface AuthFieldProps {
  /** Usually plain text; a node when part of it needs emphasis (such as the text to type). */
  label: ReactNode;
  type: "text" | "email" | "password";
  autoComplete:
    "name" | "organization" | "off" | "username" | "email" | "current-password" | "new-password";
  /**
   * The field's name in a plain form post (before hydration). Defaults to its kind (`email`,
   * `password`); new-password fields name themselves, since a form may have two.
   */
  name?: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  /** Validates when focus leaves the field. */
  onBlur: () => void;
  hint?: string;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
  /** Takes focus when the Dialog it's in opens (`data-autofocus`), instead of the first control. */
  dialogAutofocus?: boolean;
  /**
   * Defaults to "words" for text, "none" otherwise. "none" for text that must be typed exactly
   * (a case-sensitive confirmation), so a phone's keyboard doesn't capitalise it.
   */
  autoCapitalize?: "words" | "none";
  /** False for a field that may be left blank. */
  required?: boolean;
  /** Shown but not editable, such as while the form's request is in flight. */
  readOnly?: boolean;
  testId?: string;
}

/** A labelled name, email or password input (or another short text) with its hint and inline error. */
export function AuthField({
  label,
  type,
  autoComplete,
  name,
  value,
  error,
  onChange,
  onBlur,
  hint,
  inputRef,
  autoFocus = false,
  dialogAutofocus = false,
  autoCapitalize,
  required = true,
  readOnly = false,
  testId,
}: AuthFieldProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const reduce = useReducedMotion();
  const [revealed, setRevealed] = useReportedReveal();
  const isPassword = type === "password";
  return (
    <div>
      {/* wrap-anywhere: a label can hold a long email or workspace name, wider than a phone. */}
      <label htmlFor={inputId} className="mb-2 block text-body font-semibold wrap-anywhere">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type={isPassword && revealed ? "text" : type}
          // From the field's kind, not the rendered type, so showing the password keeps its name.
          name={name ?? (autoComplete === "new-password" ? undefined : type)}
          autoComplete={autoComplete}
          autoCapitalize={autoCapitalize ?? (type === "text" ? "words" : "none")}
          autoCorrect="off"
          spellCheck={false}
          inputMode={type === "email" ? "email" : undefined}
          required={required}
          readOnly={readOnly}
          // Only on pages that are nothing but this form.
          autoFocus={autoFocus}
          data-autofocus={dialogAutofocus || undefined}
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
