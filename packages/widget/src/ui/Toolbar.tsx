import type { RefObject } from "react";
import { CommentHint } from "./CommentHint";
import { HelpButton } from "./HelpButton";
import { Icon } from "./Icon";
import type { PinsStatus } from "./hooks/use-pins";

interface ToolbarProps {
  commentMode: boolean;
  commentButtonRef: RefObject<HTMLButtonElement | null>;
  onToggleComment: () => void;
  status: PinsStatus;
  openCount: number;
  resolvedCount: number;
  showPins: boolean;
  onToggleShowPins: () => void;
  showResolved: boolean;
  onToggleShowResolved: () => void;
  branch: string | null;
  onRetry: () => void;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** Floating pill: comment toggle, count, visibility toggles, branch, help. */
export function Toolbar({
  commentMode,
  commentButtonRef,
  onToggleComment,
  status,
  openCount,
  resolvedCount,
  showPins,
  onToggleShowPins,
  showResolved,
  onToggleShowResolved,
  branch,
  onRetry,
}: ToolbarProps) {
  const resolvedUnavailable = resolvedCount === 0 && !showResolved;

  // The retry button unmounts once loading restarts; keep keyboard focus in the widget.
  const retry = () => {
    onRetry();
    commentButtonRef.current?.focus();
  };

  return (
    <>
      {commentMode ? <CommentHint /> : null}
      {/* A labelled region, not role="toolbar": arrow keys belong to comment mode, so the
          toolbar pattern's arrow-key roving would be a broken promise. */}
      <div className="pp-toolbar" role="region" aria-label="Pinpoint feedback">
        <button
          ref={commentButtonRef}
          type="button"
          className="pp-btn pp-btn--toggle-primary"
          aria-pressed={commentMode}
          onClick={onToggleComment}
        >
          {/* Constant label: the pressed state is carried by aria-pressed and styling. */}
          <Icon name="message" />
          Comment
          {status === "loading" ? (
            <>
              <span className="pp-skeleton" aria-hidden="true" />
              <span className="pp-sr-only">, loading comments</span>
            </>
          ) : null}
          {status === "ready" ? (
            <>
              <span className="pp-count" aria-hidden="true">
                {openCount}
              </span>
              <span className="pp-sr-only">, {plural(openCount, "open comment")} on this page</span>
            </>
          ) : null}
        </button>

        {status === "error" ? (
          <>
            <span className="pp-status-error" role="alert">
              <Icon name="alert" />
              <span className="pp-label-wide">Couldn&apos;t load comments</span>
              <span className="pp-sr-only">.</span>
            </span>
            <button
              type="button"
              className="pp-btn pp-btn--icon pp-btn--danger"
              aria-label="Retry loading comments"
              title="Retry loading comments"
              onClick={retry}
            >
              <Icon name="retry" />
            </button>
          </>
        ) : null}

        <span className="pp-divider" aria-hidden="true" />

        <button
          type="button"
          className="pp-btn pp-btn--icon"
          aria-label="Show pins"
          title="Show pins"
          aria-pressed={showPins}
          onClick={onToggleShowPins}
        >
          <Icon name={showPins ? "eye" : "eyeOff"} />
        </button>
        {/* aria-disabled, not disabled: a disabled button drops focus to <body> when it
            disables itself under the keyboard, and stays discoverable this way. */}
        <button
          type="button"
          className="pp-btn pp-btn--icon"
          aria-label={`Show resolved (${resolvedCount})`}
          title={`Show resolved (${resolvedCount})`}
          aria-pressed={showResolved}
          aria-disabled={resolvedUnavailable}
          onClick={() => {
            if (!resolvedUnavailable) onToggleShowResolved();
          }}
        >
          <Icon name="checkCircle" />
        </button>

        {branch ? (
          <>
            <span className="pp-divider pp-divider--branch" aria-hidden="true" />
            <span className="pp-branch" title={branch}>
              <Icon name="branch" />
              <span className="pp-branch__name">{branch}</span>
            </span>
          </>
        ) : null}

        <HelpButton branch={branch} />
      </div>
    </>
  );
}
