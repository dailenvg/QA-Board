import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { RectLike } from "../core/geometry";
import { MAX_BODY_LENGTH, MAX_NAME_LENGTH, type Priority } from "../core/types";
import { Icon } from "./Icon";
import { Popover } from "./Popover";
import { PriorityField } from "./PriorityField";
import { TextField } from "./TextField";
import type { CloseOptions } from "./hooks/use-closable";

export interface ComposerValues {
  author: string;
  body: string;
  priority: Priority | null;
}

interface ComposerProps {
  number: number;
  anchor: RectLike;
  closing: boolean;
  defaultName: string;
  onSubmit: (values: ComposerValues) => Promise<void>;
  onClose: (options?: CloseOptions) => void;
}

const NAME_ERROR = "Add your name so the team knows who left this.";
const BODY_ERROR = "Write a comment before posting.";

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Something went wrong.";
}

/** Popover form for a new pin: name, comment, optional priority. */
export function Composer({
  number,
  anchor,
  closing,
  defaultName,
  onSubmit,
  onClose,
}: ComposerProps) {
  const titleId = useId();
  const nameRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [author, setAuthor] = useState(defaultName);
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<Priority | null>(null);
  const [edited, setEdited] = useState({ author: false, body: false });
  const [touched, setTouched] = useState({ author: false, body: false });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const authorError = touched.author && author.trim() === "" ? NAME_ERROR : null;
  const bodyError = touched.body && body.trim() === "" ? BODY_ERROR : null;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (submitting) return;
    setTouched({ author: true, body: true });
    if (author.trim() === "") return nameRef.current?.focus();
    if (body.trim() === "") return bodyRef.current?.focus();

    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit({ author: author.trim(), body: body.trim(), priority });
    } catch (error) {
      setSubmitError(messageOf(error));
      setSubmitting(false);
    }
  };

  // Blur only validates edited fields, so tabbing or clicking past a fresh
  // form never inserts an error that shifts the button being clicked.
  const changeAuthor = (value: string) => {
    setAuthor(value);
    setEdited((current) => ({ ...current, author: true }));
  };
  const changeBody = (value: string) => {
    setBody(value);
    setEdited((current) => ({ ...current, body: true }));
  };

  const submitOnModEnter = (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit();
  };

  return (
    <Popover
      anchor={anchor}
      closing={closing}
      labelledBy={titleId}
      initialFocusRef={defaultName ? bodyRef : nameRef}
      onDismiss={() => {
        if (body.trim() === "" && !submitting) onClose({ restoreFocus: false });
      }}
    >
      <div className="pp-popover__header">
        <span className="pp-number" aria-hidden="true">
          {number}
        </span>
        <h2 id={titleId} className="pp-popover__title">
          New comment
        </h2>
        <button
          type="button"
          className="pp-btn pp-btn--icon pp-popover__close"
          aria-label="Discard comment"
          onClick={() => onClose()}
        >
          <Icon name="close" />
        </button>
      </div>

      <form className="pp-form" noValidate onSubmit={(event) => void submit(event)}>
        <TextField
          label="Your name"
          value={author}
          onChange={changeAuthor}
          onBlur={() =>
            setTouched((current) => ({ ...current, author: current.author || edited.author }))
          }
          error={authorError}
          autoComplete="name"
          maxLength={MAX_NAME_LENGTH}
          inputRef={nameRef}
        />
        <TextField
          label="Comment"
          multiline
          value={body}
          onChange={changeBody}
          onBlur={() =>
            setTouched((current) => ({ ...current, body: current.body || edited.body }))
          }
          onKeyDown={submitOnModEnter}
          error={bodyError}
          placeholder="What should change here?"
          maxLength={MAX_BODY_LENGTH}
          inputRef={bodyRef}
        />
        <PriorityField value={priority} onChange={setPriority} />

        {submitError ? (
          <p className="pp-form-error" role="alert">
            Couldn&apos;t post your comment: {submitError} Try again.
          </p>
        ) : null}

        <div className="pp-actions">
          <button type="button" className="pp-btn pp-btn--secondary" onClick={() => onClose()}>
            Cancel
          </button>
          <button type="submit" className="pp-btn pp-btn--primary" aria-disabled={submitting}>
            {submitting ? "Posting…" : "Post comment"}
          </button>
        </div>
      </form>
    </Popover>
  );
}
