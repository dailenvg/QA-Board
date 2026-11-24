"use client";

import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { SHARE_LIMITS } from "@/lib/share/limits";
import { newId } from "@/lib/store/id";
import type { Result } from "@/lib/store/store";
import { useMediaQuery } from "@/lib/use-media-query";
import { FormAlert } from "../auth/FormAlert";
import { Button } from "../ui/Button";
import { FieldError } from "../ui/FieldError";
import { FIELD_CLASS } from "../ui/field-styles";
import { Icon } from "../ui/Icon";
import type { ReplyDraft } from "./comment-threads";
import { sendsOnEnter } from "./send-key";

interface ReplyComposerProps {
  /** The member's name; null until they give one, so the box asks for it first. */
  authorName: string | null;
  /** Resolves once the reply is saved or refused, never rejecting. */
  onSend: (draft: ReplyDraft) => Promise<Result<unknown>>;
}

const EMPTY = "Write a reply first.";
const NAME_MISSING = "Add your name so others know who replied.";
const HINT = "Enter to send · Shift+Enter for a new line";

type FieldProblem = { field: "name" | "body"; message: string } | null;

/**
 * The box under a thread. Enter sends, Shift+Enter adds a line, and an input
 * method's Enter only picks its word (U2). While it's sent the words stay,
 * read-only, and Reply says "Sending…"; a refusal keeps them, with why, so
 * sending again is one key away. Sent, the box empties and keeps focus.
 */
export function ReplyComposer({ authorName, onSend }: ReplyComposerProps) {
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState(authorName ?? "");
  // Asked once: the field stays while it's being typed in, even after the name is saved.
  const [askName] = useState(!authorName);
  const [problem, setProblem] = useState<FieldProblem>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  // Chosen when the reply is written, so sending again after a failure can't post it twice.
  const [id, setId] = useState(newId);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  /** Typed in: only then does leaving it empty say so, not when Tab just passes through. */
  const nameTouched = useRef(false);
  // The hint shows from `sm:` up (phones have no Shift on their Enter), and is read only there too.
  const showsHint = useMediaQuery("(min-width: 640px)");
  const bodyId = useId();
  const nameId = useId();
  const bodyErrorId = useId();
  const nameErrorId = useId();
  const hintId = useId();
  const bodyError = problem?.field === "body" ? problem.message : null;
  const nameError = problem?.field === "name" ? problem.message : null;

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (sending) return;
    if (askName && !author.trim()) {
      setProblem({ field: "name", message: NAME_MISSING });
      nameRef.current?.focus();
      return;
    }
    if (!body.trim()) {
      setProblem({ field: "body", message: EMPTY });
      bodyRef.current?.focus();
      return;
    }
    setSending(true);
    setSendError(null);
    setStatus("Sending…");
    const result = await onSend({ id, body, author });
    setSending(false);
    if (!result.ok) {
      setStatus("");
      setSendError(result.error);
      return;
    }
    setBody("");
    setId(newId());
    setStatus("Reply sent.");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const { key, shiftKey, keyCode, nativeEvent } = event;
    if (!sendsOnEnter({ key, shiftKey, keyCode, isComposing: nativeEvent.isComposing })) return;
    event.preventDefault();
    void send();
  };

  return (
    <form
      onSubmit={(event) => void send(event)}
      noValidate
      aria-busy={sending || undefined}
      data-testid="reply-composer"
      className="flex flex-col gap-2"
    >
      {askName ? (
        <div>
          <label htmlFor={nameId} className="mb-1 block text-meta font-semibold">
            Your name
          </label>
          <input
            ref={nameRef}
            id={nameId}
            value={author}
            maxLength={80}
            required
            autoComplete="name"
            readOnly={sending}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameErrorId}
            onChange={(event) => {
              nameTouched.current = true;
              setAuthor(event.target.value);
              setProblem((current) => (current?.field === "name" ? null : current));
            }}
            onBlur={() => {
              // The box sits in the list's Tab order: passing through it says nothing yet.
              if (author.trim() || !(nameTouched.current || body.trim())) return;
              setProblem({ field: "name", message: NAME_MISSING });
            }}
            className={FIELD_CLASS}
          />
          <FieldError id={nameErrorId} message={nameError} />
        </div>
      ) : null}
      <div>
        <label htmlFor={bodyId} className="sr-only">
          Reply
        </label>
        <textarea
          ref={bodyRef}
          id={bodyId}
          value={body}
          rows={2}
          maxLength={SHARE_LIMITS.body}
          required
          // The post already carries the words: any typed while it's sent would be lost.
          readOnly={sending}
          placeholder="Reply…"
          // Enter sends here (U2), so a phone's keyboard labels the key Send rather than Return.
          enterKeyHint="send"
          aria-invalid={bodyError ? true : undefined}
          aria-describedby={showsHint ? `${bodyErrorId} ${hintId}` : bodyErrorId}
          onChange={(event) => {
            setBody(event.target.value);
            setProblem((current) => (current?.field === "body" ? null : current));
          }}
          onKeyDown={onKeyDown}
          className={`${FIELD_CLASS} resize-none py-2`}
        />
        <FieldError id={bodyErrorId} message={bodyError} />
      </div>
      {/* Always present, so each change is announced (a region added with its words isn't). */}
      <p role="status" className="sr-only" data-testid="reply-status">
        {status}
      </p>
      <FormAlert message={sendError} testId="reply-send-error" className="-mt-2 has-[p]:mt-0" />
      <div className="flex items-center justify-between gap-3">
        {/* Phones have no Shift on their Enter, so the hint is for keyboards (as the Composer's). */}
        <p id={hintId} className="hidden text-label text-muted sm:block">
          {HINT}
        </p>
        {/* aria-disabled, not disabled: focus stays put, so sending again is right here on failure. */}
        <Button
          type="submit"
          size="sm"
          className="ml-auto whitespace-nowrap"
          aria-disabled={sending || undefined}
        >
          <Icon name="reply" className="size-4" />
          {sending ? "Sending…" : "Reply"}
        </Button>
      </div>
    </form>
  );
}
