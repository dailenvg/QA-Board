import { useState, type FormEvent, type KeyboardEvent } from "react";
import { MAX_BODY_LENGTH, MAX_NAME_LENGTH } from "../core/types";
import { TextField } from "./TextField";

export interface ReplyValues {
  author: string;
  body: string;
}

interface ReplyFormProps {
  reviewerName: string;
  onReply: (values: ReplyValues) => Promise<void>;
}

const NAME_ERROR = "Add your name to reply.";
const BODY_ERROR = "Write a reply first.";

/** Reply box under a thread. Asks for a name only if none is remembered. */
export function ReplyForm({ reviewerName, onReply }: ReplyFormProps) {
  const [author, setAuthor] = useState(reviewerName);
  const [body, setBody] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const askForName = reviewerName === "";

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (sending) return;
    setShowErrors(true);
    if (author.trim() === "" || body.trim() === "") return;

    setSending(true);
    setError(null);
    try {
      await onReply({ author: author.trim(), body: body.trim() });
      setBody("");
      setShowErrors(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  };

  const submitOnModEnter = (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit();
  };

  return (
    <form className="pp-form" noValidate onSubmit={(event) => void submit(event)}>
      {askForName ? (
        <TextField
          label="Your name"
          value={author}
          onChange={setAuthor}
          error={showErrors && author.trim() === "" ? NAME_ERROR : null}
          autoComplete="name"
          maxLength={MAX_NAME_LENGTH}
          required
        />
      ) : null}
      <TextField
        label="Reply"
        multiline
        rows={2}
        value={body}
        onChange={setBody}
        onKeyDown={submitOnModEnter}
        error={showErrors && body.trim() === "" ? BODY_ERROR : null}
        maxLength={MAX_BODY_LENGTH}
        required
      />
      {error ? (
        <p className="pp-form-error" role="alert">
          Couldn&apos;t send your reply: {error} Try again.
        </p>
      ) : null}
      <div className="pp-actions">
        <button type="submit" className="pp-btn pp-btn--primary" aria-disabled={sending}>
          {sending ? "Sending…" : "Reply"}
        </button>
      </div>
    </form>
  );
}
