"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { SHARE_LIMITS } from "@/lib/share/limits";
import type { EditRefusal } from "@/lib/viewer-backend/backend";
import { FormAlert } from "../auth/FormAlert";
import { Button } from "../ui/Button";
import { FieldError } from "../ui/FieldError";
import { FIELD_CLASS } from "../ui/field-styles";

/** What an empty edit says on the team's own comments, which they can delete instead. */
export const EMPTY_TEAM_EDIT = "A comment can't be empty. Delete it instead.";
/** A client can't delete their comment (D7), so theirs offers the old words instead. */
export const EMPTY_CLIENT_EDIT =
  "A comment can't be empty. Type something, or cancel to keep the old text.";

interface CommentEditorProps {
  initialBody: string;
  onSave: (body: string) => void;
  onCancel: () => void;
  /**
   * Waiting for the server (a client's edit): the text is read-only, Save
   * reads "Saving…", and neither button nor shortcut does anything.
   */
  pending?: boolean;
  /**
   * Why the last save didn't go through, shown in the editor so the typed
   * text stays. A `final` one can't be retried: Save goes, Cancel becomes
   * Close, and focus moves to it.
   */
  error?: EditRefusal | null;
  /** What an empty edit says; the team's suggests deleting instead. */
  emptyMessage?: string;
}

/** Inline edit form. Ctrl/Cmd+Enter saves, Escape cancels. */
export function CommentEditor({
  initialBody,
  onSave,
  onCancel,
  pending = false,
  error = null,
  emptyMessage = EMPTY_TEAM_EDIT,
}: CommentEditorProps) {
  const [body, setBody] = useState(initialBody);
  const [empty, setEmpty] = useState<string | null>(null);
  const fieldId = useId();
  const errorId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const buttonsRef = useRef<HTMLDivElement>(null);
  const stopWatchingViewport = useRef<(() => void) | null>(null);
  // An editor removed while focused never blurs.
  useEffect(() => () => stopWatchingViewport.current?.(), []);
  const final = error?.final === true;

  useEffect(() => {
    if (final) closeRef.current?.focus();
    // The alert pushes the buttons down: in the phone's short sheet, keep Save in reach to retry.
    else if (error) buttonsRef.current?.scrollIntoView({ block: "nearest" });
  }, [final, error]);

  const save = (event?: FormEvent) => {
    event?.preventDefault();
    if (pending || final) return;
    if (!body.trim()) {
      setEmpty(emptyMessage);
      return;
    }
    onSave(body);
  };

  const cancel = () => {
    if (!pending) onCancel();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    }
  };

  // On the form, not just the field: Escape also works once focus is on Close or Save.
  const onFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
  };

  return (
    <form
      onSubmit={save}
      onKeyDown={onFormKeyDown}
      noValidate
      aria-busy={pending || undefined}
      className="flex flex-col gap-2 p-2"
    >
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
        readOnly={pending}
        aria-invalid={empty ? true : undefined}
        aria-describedby={errorId}
        onChange={(event) => {
          setBody(event.target.value);
          setEmpty(null);
        }}
        onFocus={(event) => {
          const field = event.currentTarget;
          field.setSelectionRange(body.length, body.length);
          // On a phone the keyboard is about to cover the lower half: keep the field in view,
          // and again once it's up and the visible area has shrunk.
          field.scrollIntoView({ block: "nearest" });
          stopWatchingViewport.current?.();
          const viewport = window.visualViewport;
          if (!viewport) return;
          const keepInView = () => field.scrollIntoView({ block: "nearest" });
          viewport.addEventListener("resize", keepInView);
          stopWatchingViewport.current = () => viewport.removeEventListener("resize", keepInView);
        }}
        onBlur={() => {
          // A desktop viewport never resizes, so the listener goes when the field does.
          stopWatchingViewport.current?.();
          stopWatchingViewport.current = null;
        }}
        onKeyDown={onKeyDown}
        className={`${FIELD_CLASS} resize-y py-2`}
      />
      <FieldError id={errorId} message={empty} />
      {/* -mt-2 cancels the form's gap while the live region is empty, so no stray 8px. */}
      <FormAlert
        message={error?.error ?? null}
        testId="comment-edit-alert"
        className="-mt-2 has-[p]:mt-0"
      />
      <div ref={buttonsRef} className="flex justify-end gap-2">
        <Button
          ref={closeRef}
          variant="ghost"
          size="sm"
          onClick={cancel}
          aria-disabled={pending || undefined}
        >
          {final ? "Close" : "Cancel"}
        </Button>
        {final ? null : (
          <Button type="submit" size="sm" aria-disabled={pending || undefined}>
            {pending ? "Saving…" : "Save"}
          </Button>
        )}
      </div>
    </form>
  );
}
