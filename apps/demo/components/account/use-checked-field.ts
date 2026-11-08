"use client";

import { useState } from "react";

type Rule = (value: string) => string | null;

export interface CheckedField {
  value: string;
  error: string | null;
  setError: (error: string | null) => void;
  /** Checks the value now (on submit) and returns the error, if any. */
  check: () => string | null;
  /** Empties the field and its error (after a save). */
  clear: () => void;
  /** For `AuthField`: change and blur handling. */
  field: {
    value: string;
    error: string | null;
    onChange: (value: string) => void;
    onBlur: () => void;
  };
}

/**
 * A settings field checked by `rule`: when focus leaves it (an empty field
 * isn't a mistake yet, so tabbing past it says nothing), on every change once
 * it has an error (so the error clears as soon as it's fixed), and on submit.
 */
export function useCheckedField(rule: Rule, initial = ""): CheckedField {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return {
    value,
    error,
    setError,
    check: () => {
      const found = rule(value);
      setError(found);
      return found;
    },
    clear: () => {
      setValue("");
      setError(null);
    },
    field: {
      value,
      error,
      onChange: (next) => {
        setValue(next);
        if (error) setError(rule(next));
      },
      onBlur: () => setError((current) => (value ? rule(value) : current)),
    },
  };
}
