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
import { Switch } from "../ui/Switch";
import type { ReplyDraft, ReplyVisibility } from "./comment-threads";
import { sendsOnEnter } from "./send-key";

interface ReplyComposerProps {
  /** The member's name; null until they give one, so the box asks for it first. */
  authorName: string | null;
  /** Resolves once the reply is saved or refused, never rejecting. */
  onSend: (draft: ReplyDraft) => Promise<Result<unknown>>;
  /** Words typed earlier and not sent, such as in the card before its popover opened. */
  initialBody?: string;
  /** The words as typed, so they outlive this box. */
  onDraftChange?: (body: string) => void;
  /**
   * Takes focus on mounting (opened from a Reply button): the name field when it's asked,
   * else the reply.
   */
  autoFocus?: boolean;
  /**
   * The team's box (057): `choose` offers a "Team only" switch beside Reply, off every time;
   * `kept` (under a team-only comment) has none and says the reply stays with the team.
   */
  visibility?: ReplyVisibility;
}

const EMPTY = "Write a reply first.";
const NAME_MISSING = "Add your name so others know who replied.";
const HINT = "Enter to send · Shift+Enter for a new line";
const PLACEHOLDER = { shown: "Reply…", kept: "Reply to your team…" } as const;

type FieldProblem = { field: "name" | "body"; message: string } | null;

/**
 * The box under a thread. Enter sends, Shift+Enter adds a line, and an input
 * method's Enter only picks its word (U2). While it's sent the words stay,
 * read-only, and Reply says "Sending…"; a refusal keeps them, with why, so
 * sending again is one key away. Sent, the box empties and keeps focus.
 */
export function ReplyComposer({
  authorName,
  onSend,
  initialBody = "",
  onDraftChange,
  autoFocus = false,
  visibility,
}: ReplyComposerProps) {
  const [body, setBody] = useState(initialBody);
  /** The switch, off every time (D15): after each reply sent, too. */
  const [teamOnly, setTeamOnly] = useState(false);
  const choose = visibility === "choose";
  const [author, setAuthor] = useState(authorName ?? "");
  /** Typed in the name field: it then stays, whatever name arrives, so nothing typed is lost. */
  const [nameTyped, setNameTyped] = useState(false);
  // Asked while the member has no name; one that arrives later (another tab) takes its place.
  const askName = !authorName || nameTyped;
  const name = askName ? author : (authorName ?? "");
  const [problem, setProblem] = useState<FieldProblem>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  // Chosen when the reply is written, so sending again after a failure can't post it twice.
  const [id, setId] = useState(newId);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  // The hint shows from `sm:` up (phones have no Shift on their Enter), and is read only there too.
  const showsHint = useMediaQuery("(min-width: 640px)");
  const bodyId = useId();
  const nameId = useId();
  const bodyErrorId = useId();
  const nameErrorId = useId();
  const hintId = useId();
  const teamOnlyId = useId();
  const teamOnlyLabelId = useId();
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
    const result = await onSend({
      id,
      body,
      author: name,
      ...(choose && teamOnly ? { teamOnly: true } : {}),
    });
    setSending(false);
    if (!result.ok) {
      setStatus("");
      setSendError(result.error);
      return;
    }
    // The send took the words out of the draft as it started (`sendReplyDraft`).
    setBody("");
    setId(newId());
    setTeamOnly(false);
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
            autoFocus={autoFocus}
            readOnly={sending}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameErrorId}
            onChange={(event) => {
              setNameTyped(true);
              setAuthor(event.target.value);
              setProblem((current) => (current?.field === "name" ? null : current));
            }}
            onBlur={() => {
              // The box sits in the list's Tab order: passing through it says nothing yet.
              if (author.trim() || !(nameTyped || body.trim())) return;
              setProblem({ field: "name", message: NAME_MISSING });
            }}
            onKeyDown={(event) => {
              // Enter after the name goes on to the reply while there's none yet, rather than
              // sending and saying it's missing. With words written, Enter sends them.
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              if (!author.trim() || body.trim()) return;
              event.preventDefault();
              bodyRef.current?.focus();
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
          autoFocus={autoFocus && !askName}
          // The post already carries the words: any typed while it's sent would be lost.
          readOnly={sending}
          placeholder={visibility === "kept" ? PLACEHOLDER.kept : PLACEHOLDER.shown}
          // Enter sends here (U2), so a phone's keyboard labels the key Send rather than Return.
          enterKeyHint="send"
          aria-invalid={bodyError ? true : undefined}
          aria-describedby={showsHint ? `${bodyErrorId} ${hintId}` : bodyErrorId}
          onChange={(event) => {
            setBody(event.target.value);
            onDraftChange?.(event.target.value);
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
      {/* Phones have no Shift on their Enter, so the hint is for keyboards (as the Composer's). */}
      {choose ? (
        // The switch takes the hint's place in the row, so the hint goes above it (from `sm:` up).
        <p id={hintId} className="-mt-1 hidden text-label text-muted sm:block">
          {HINT}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        {choose ? (
          <div className="-ml-2 flex min-w-0 items-center">
            <Switch
              id={teamOnlyId}
              checked={teamOnly}
              onChange={() => setTeamOnly((on) => !on)}
              labelledBy={teamOnlyLabelId}
              // The post already carries the choice: one changed while it's sent would be lost.
              inactive={sending}
              testId="reply-team-only-switch"
            />
            <label
              id={teamOnlyLabelId}
              htmlFor={teamOnlyId}
              className="flex min-h-11 cursor-pointer items-center gap-1 pr-1 text-meta font-semibold"
            >
              <Icon name="lock" className="size-3.5 shrink-0" />
              Team only
            </label>
          </div>
        ) : (
          <p id={hintId} className="hidden text-label text-muted sm:block">
            {HINT}
          </p>
        )}
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
