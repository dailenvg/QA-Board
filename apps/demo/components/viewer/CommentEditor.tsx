"use client";

import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { SHARE_LIMITS } from "@/lib/share/limits";
import { Button } from "../ui/Button";
import { FieldError } from "../ui/FieldError";
import { FIELD_CLASS } from "../ui/field-styles";

interface CommentEditorProps {
  initialBody: string;
  onSave: (body: string) => void;
  onCancel: () => void;
}

/** Inline edit form. Ctrl/Cmd+Enter saves, Escape cancels. */
export function CommentEditor({ initialBody, onSave, onCancel }: CommentEditorProps) {
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const errorId = useId();

  const save = (event?: FormEvent) => {
    event?.preventDefault();
    if (!body.trim()) {
      setError("A comment can't be empty. Delete it instead.");
      return;
    }
    onSave(body);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    }
  };

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-2 p-2">
      <label htmlFor={fieldId} className="px-1 text-meta font-semibold">
        Edit comment
      </label>
      <textarea
        id={fieldId}
        autoFocus
        required
        rows={3}
        maxLength={SHARE_LIMITS.body}
        value={body}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        onChange={(event) => {
          setBody(event.target.value);
          setError(null);
        }}
        onFocus={(event) => event.currentTarget.setSelectionRange(body.length, body.length)}
        onKeyDown={onKeyDown}
        className={`${FIELD_CLASS} resize-y py-2`}
      />
      <FieldError id={errorId} message={error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm">
          Save
        </Button>
      </div>
    </form>
  );
}
