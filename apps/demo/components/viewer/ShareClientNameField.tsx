"use client";

import { useId } from "react";
import { CLIENT_NAME_MAX } from "@/lib/share/client-name";
import { FieldError } from "../ui/FieldError";
import { FIELD_CLASS } from "../ui/field-styles";

interface ShareClientNameFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Saves it, when it changed: as the field loses focus, or on Enter. */
  onCommit: () => void;
  /** "Saving…", "Saved" or nothing, beside the label. */
  status: string;
  error: string | null;
}

/**
 * Who the link is for: optional, up to 80 characters, saved as the field
 * loses focus (or on Enter). The preview follows it as it's typed.
 */
export function ShareClientNameField({
  value,
  onChange,
  onCommit,
  status,
  error,
}: ShareClientNameFieldProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  return (
    <div className="flex flex-col">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="text-body font-semibold">
          Client name
        </label>
        <span className="flex shrink-0 gap-2 text-meta text-muted">
          <span role="status" data-testid="client-name-status">
            {status}
          </span>
          <span id={hintId}>Optional</span>
        </span>
      </div>
      <input
        id={inputId}
        type="text"
        value={value}
        maxLength={CLIENT_NAME_MAX}
        autoComplete="organization"
        autoCapitalize="words"
        placeholder="Who's reviewing, such as Acme Studio"
        aria-describedby={`${hintId} ${errorId}`}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommit();
          }
        }}
        data-view-focus
        data-testid="client-name"
        className={FIELD_CLASS}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}
