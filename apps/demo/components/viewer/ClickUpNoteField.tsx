"use client";

import { useId } from "react";
import { NOTE_MAX, noteLength } from "@/lib/integrations/clickup/message";
import { FIELD_CLASS } from "../ui/field-styles";
import { CLICKUP_SEND_COPY } from "./clickup-send-copy";

const COPY = CLICKUP_SEND_COPY.note;

/** Below this many characters left, the count is read out as it changes. */
const ANNOUNCE_BELOW = 100;

interface ClickUpNoteFieldProps {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
}

/**
 * The note sent with the project: optional plain text, up to `NOTE_MAX`
 * characters (`maxLength` counts UTF-16 units, so it never lets more
 * through than the server takes), with how many are left beside its label.
 * Its marks are sent as typed (`escapeMarkdown`), which the hint says.
 */
export function ClickUpNoteField({ value, onChange, readOnly }: ClickUpNoteFieldProps) {
  const fieldId = useId();
  const hintId = useId();
  const left = NOTE_MAX - noteLength(value);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={fieldId} className="text-body font-semibold">
          {COPY.label}
        </label>
        <span
          className="shrink-0 text-meta text-muted"
          aria-live={left < ANNOUNCE_BELOW ? "polite" : "off"}
          data-testid="clickup-note-left"
        >
          {value ? COPY.left(left) : CLICKUP_SEND_COPY.optional}
        </span>
      </div>
      <textarea
        id={fieldId}
        value={value}
        rows={3}
        maxLength={NOTE_MAX}
        readOnly={readOnly}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value)}
        className={`${FIELD_CLASS} min-h-24 resize-y py-3`}
        data-testid="clickup-note"
      />
      <p id={hintId} className="text-meta text-pretty text-muted">
        {COPY.hint}
      </p>
    </div>
  );
}
