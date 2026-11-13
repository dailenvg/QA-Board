"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { fadeOnly } from "@/lib/motion";
import { CLIENT_NAME_MAX } from "@/lib/share/client-name";
import { FieldError } from "../ui/FieldError";
import { FIELD_CLASS } from "../ui/field-styles";
import { Icon } from "../ui/Icon";

interface ShareClientNameFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Saves it, when it changed: as the field loses focus, or on Enter. */
  onCommit: () => void;
  /** "Saving…", "Saved" (for a moment) or nothing: in place of "Optional", beside the label. */
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
        {/* "Saving…", then "Saved" with a check, stand in for "Optional" for a moment. The hint
            stays readable to screen readers, and the status is the only live text. */}
        <span className="flex shrink-0 items-center text-meta text-muted">
          <span id={hintId} className={status ? "sr-only" : undefined}>
            Optional
          </span>
          <span role="status" data-testid="client-name-status">
            {status ? (
              <motion.span
                key={status}
                variants={fadeOnly}
                initial="hidden"
                animate="visible"
                className={`flex items-center gap-1 ${status === "Saved" ? "text-resolved-text" : ""}`}
              >
                {status === "Saved" ? <Icon name="check" className="size-4 shrink-0" /> : null}
                {status}
              </motion.span>
            ) : null}
          </span>
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
