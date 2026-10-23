import { useId, useRef, useState } from "react";
import type { RectLike } from "../core/geometry";
import type { Pin } from "../core/types";
import { CopyLinkButton } from "./CopyLinkButton";
import { Icon } from "./Icon";
import { Message } from "./Message";
import { Popover } from "./Popover";
import { ReplyForm, type ReplyValues } from "./ReplyForm";
import type { CloseOptions } from "./hooks/use-closable";

interface ThreadProps {
  pin: Pin;
  number: number;
  detached: boolean;
  anchor: RectLike;
  closing: boolean;
  reviewerName: string;
  onReply: (values: ReplyValues) => Promise<void>;
  onResolve: () => Promise<void>;
  onClose: (options?: CloseOptions) => void;
}

function isLinkable(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Thread popover: original comment, screenshot, replies, reply box, resolve. */
export function Thread({
  pin,
  number,
  detached,
  anchor,
  closing,
  reviewerName,
  onReply,
  onResolve,
  onClose,
}: ThreadProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [screenshotFailed, setScreenshotFailed] = useState(false);

  const resolve = async () => {
    if (resolving) return;
    setResolving(true);
    setResolveError(null);
    try {
      await onResolve();
      // The Resolve button is replaced by static text, which would drop focus to
      // <body> and out of the dialog's focus trap. Park it on a control that stays.
      closeRef.current?.focus();
    } catch (error) {
      setResolveError(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setResolving(false);
    }
  };

  const linkable = pin.screenshotUrl !== null && isLinkable(pin.screenshotUrl);
  const screenshot =
    pin.screenshotUrl && !screenshotFailed ? (
      <img
        className="pp-screenshot"
        src={pin.screenshotUrl}
        alt={`Screenshot when pin ${number} was left`}
        decoding="async"
        onError={() => setScreenshotFailed(true)}
      />
    ) : null;

  return (
    <Popover
      anchor={anchor}
      closing={closing}
      labelledBy={titleId}
      initialFocusRef={headingRef}
      onDismiss={() => onClose({ restoreFocus: false })}
    >
      <div className="pp-popover__header">
        <span className="pp-number" aria-hidden="true">
          {number}
        </span>
        {/* Focused on open so screen readers start at the title, not at "Close". */}
        <h2 id={titleId} ref={headingRef} tabIndex={-1} className="pp-popover__title">
          Comment {number}
        </h2>
        <button
          ref={closeRef}
          type="button"
          className="pp-btn pp-btn--icon pp-popover__close"
          aria-label="Close thread"
          onClick={() => onClose()}
        >
          <Icon name="close" />
        </button>
      </div>

      <Message
        author={pin.author}
        createdAt={pin.createdAt}
        body={pin.body}
        tags={
          <>
            {pin.priority ? (
              <span className={`pp-tag pp-tag--${pin.priority}`}>{pin.priority}</span>
            ) : null}
            {pin.resolved ? <span className="pp-tag pp-tag--resolved">Resolved</span> : null}
          </>
        }
      />

      {detached ? (
        <p className="pp-notice">
          The element this pin was attached to has changed. It is shown at its original screen
          position.
        </p>
      ) : null}

      {screenshot && linkable && pin.screenshotUrl ? (
        <a className="pp-screenshot-link" href={pin.screenshotUrl} target="_blank" rel="noreferrer">
          {screenshot}
        </a>
      ) : (
        screenshot
      )}

      {/* Error state: e.g. a private-repo image for a reviewer not signed in to GitHub. */}
      {screenshotFailed ? (
        <p className="pp-notice">
          The screenshot could not be shown here.{" "}
          {linkable && pin.screenshotUrl ? (
            <a href={pin.screenshotUrl} target="_blank" rel="noreferrer">
              Open it in a new tab
            </a>
          ) : null}
        </p>
      ) : null}

      {pin.replies.length > 0 ? (
        <ol className="pp-replies" aria-label="Replies">
          {pin.replies.map((reply) => (
            <li key={reply.id}>
              <Message author={reply.author} createdAt={reply.createdAt} body={reply.body} />
            </li>
          ))}
        </ol>
      ) : null}

      <ReplyForm reviewerName={reviewerName} onReply={onReply} />

      {resolveError ? (
        <p className="pp-form-error" role="alert">
          Couldn&apos;t resolve: {resolveError} Try again.
        </p>
      ) : null}

      <div className="pp-row">
        <CopyLinkButton url={pin.deepLink} />
        {pin.resolved ? (
          <span className="pp-meta">Resolved{pin.resolvedBy ? ` by ${pin.resolvedBy}` : ""}</span>
        ) : (
          <button
            type="button"
            className="pp-btn pp-btn--secondary"
            aria-disabled={resolving}
            onClick={() => void resolve()}
          >
            <Icon name="checkCircle" />
            {resolving ? "Resolving…" : "Resolve"}
          </button>
        )}
      </div>
    </Popover>
  );
}
