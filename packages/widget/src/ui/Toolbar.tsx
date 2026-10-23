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
  return (
    <>
      {commentMode ? <CommentHint /> : null}
      <div className="pp-toolbar" role="toolbar" aria-label="Pinpoint feedback">
        <button
          ref={commentButtonRef}
          type="button"
          className="pp-btn pp-btn--toggle-primary"
          aria-pressed={commentMode}
          onClick={onToggleComment}
        >
          <Icon name={commentMode ? "close" : "message"} />
          {commentMode ? "Cancel" : "Comment"}
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
              className="pp-btn pp-btn--icon"
              aria-label="Retry loading comments"
              onClick={onRetry}
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
          aria-pressed={showPins}
          onClick={onToggleShowPins}
        >
          <Icon name={showPins ? "eye" : "eyeOff"} />
        </button>
        <button
          type="button"
          className="pp-btn pp-btn--icon"
          aria-label={`Show resolved (${resolvedCount})`}
          aria-pressed={showResolved}
          disabled={resolvedCount === 0 && !showResolved}
          onClick={onToggleShowResolved}
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
