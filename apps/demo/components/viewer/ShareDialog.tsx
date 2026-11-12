"use client";

import { useEffect, useId, useRef } from "react";
import { relativeTime } from "@/lib/relative-time";
import { spokenTimeLeft, timeLeft, type ReviewWindowChoice } from "@/lib/share/review-window";
import type { SyncStatus } from "@/lib/share-client/owner-sync";
import type { ShareFit } from "@/lib/share-client/use-share-fit";
import type { Result } from "@/lib/store/store";
import type { ProjectShare } from "@/lib/store/types";
import { useNow } from "@/lib/use-now";
import { CopyLinkField } from "../review-link/CopyLinkField";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { FieldError } from "../ui/FieldError";
import { Icon, type IconName } from "../ui/Icon";
import { ReviewWindowControl } from "./ReviewWindowControl";
import { SharePasswordControl } from "./SharePasswordControl";

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  share: ProjectShare | undefined;
  url: string | null;
  status: SyncStatus;
  /** Whether the project fits in a share; a link is only offered once it does. */
  fit: ShareFit;
  creating: boolean;
  revoking: boolean;
  error: string | null;
  /** The link's review window, or the one a new link will get. */
  reviewWindow: ReviewWindowChoice;
  /** A change of the link's window is on its way to the server. */
  savingWindow: boolean;
  /** Why the last change of the window didn't save; null when it did. */
  windowError: string | null;
  onReviewWindowChange: (choice: ReviewWindowChoice) => void;
  /** Sets the link's password, or with null removes it; resolves with the server's answer. */
  onPasswordChange: (password: string | null) => Promise<Result>;
  /**
   * The dialog steps aside for a confirmation (closing the review, revoking)
   * and opens again after it: the control the question came from, which gets
   * focus back rather than the Close button.
   */
  returnFocus?: "window" | "revoke" | null;
  onCreate: () => void;
  onRetry: () => void;
  onRevoke: () => void;
}

function syncLine(status: SyncStatus, share: ProjectShare, now: number): string {
  if (status.uploading)
    return `Uploading images: ${status.uploading.done} of ${status.uploading.total}`;
  if (status.phase === "syncing") return "Syncing…";
  if (status.phase === "error") return "Changes haven't reached the link yet. Retrying…";
  if (status.pullHeld) return "Some client comments haven't arrived yet. Retrying…";
  const at = Math.max(status.checkedAt ?? 0, share.lastSyncedAt ?? 0);
  return at ? `Synced ${relativeTime(at, now)}` : "Not synced yet";
}

/**
 * How long clients can still comment through the link, by the server's
 * deadline (the window starts when the link is created).
 */
function reviewLine(share: ProjectShare, now: number): string {
  if (share.reviewEndsAt === null) {
    return "No time limit. Clients can comment until you revoke the link.";
  }
  const left = timeLeft(share.reviewEndsAt, now);
  return left
    ? `Clients can comment for ${spokenTimeLeft(left)} more.`
    : "Review window closed. Clients can still read comments but can't add new ones. To reopen it, choose a longer window or No limit.";
}

/**
 * Owner's share settings: create the link, copy it, see sync status, set the
 * review window and the password, revoke it.
 */
export function ShareDialog({
  open,
  onClose,
  share,
  url,
  status,
  fit,
  creating,
  revoking,
  error,
  reviewWindow,
  savingWindow,
  windowError,
  onReviewWindowChange,
  onPasswordChange,
  returnFocus = null,
  onCreate,
  onRetry,
  onRevoke,
}: ShareDialogProps) {
  const now = useNow();
  const errorId = useId();
  const reviewLineId = useId();
  const gone = status.phase === "gone";
  // Never "Synced" while client additions are held back.
  const failing = status.phase === "error" || status.pullHeld;
  const busy = status.phase === "syncing" || Boolean(status.uploading);
  const synced = Boolean(status.checkedAt ?? share?.lastSyncedAt);
  // A check only once something has synced; "Not synced yet" keeps the neutral refresh icon.
  const syncIcon: IconName = failing ? "alert" : busy || !synced ? "refresh" : "check";
  const syncTone = failing ? "text-danger" : "text-muted";
  // The store shows a new link before the server has kept it. Hold the link view until it has, so
  // a refused save doesn't flash a link (and announce "Link created.") and then take it back.
  const linked = Boolean(share && url && !gone && !creating);
  // Disabled while checking or too big; aria-disabled keeps it focusable, so the reason is read.
  const blocked = creating || fit.status !== "fits";
  const createLabel =
    fit.status === "checking"
      ? "Checking size…"
      : creating
        ? "Creating link…"
        : gone
          ? "Create a new link"
          : "Create link";
  const linkedView = useRef<HTMLDivElement>(null);
  const createView = useRef<HTMLDivElement>(null);
  const wasLinked = useRef(linked);

  // Creating the link replaces the focused Create button with the link view; the link going
  // away (revoked, or gone in another tab) does the reverse. Carry focus to the view's main
  // button (Create, or the link view's first), so it doesn't fall to the page behind the modal.
  useEffect(() => {
    if (open && linked !== wasLinked.current) {
      const view = linked ? linkedView.current : createView.current;
      if (view && !view.contains(document.activeElement)) {
        const main = view.querySelector<HTMLElement>("[data-view-focus]");
        (main ?? view.querySelector<HTMLElement>("button"))?.focus();
      }
    }
    wasLinked.current = linked;
  }, [open, linked]);

  // Back from a confirmation: focus returns to the window's selected choice (the new one, if
  // confirmed) or to Revoke, where the keyboard user left off. Runs after the Dialog's own
  // first focus (child effects run first), so it wins over the Close button.
  useEffect(() => {
    if (!open || !returnFocus) return;
    const view = linkedView.current;
    const target =
      returnFocus === "window"
        ? view?.querySelector<HTMLElement>('[role="radiogroup"] [role="radio"][tabindex="0"]')
        : view?.querySelector<HTMLElement>('[data-return-focus="revoke"]');
    target?.focus();
  }, [open, returnFocus]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Share with clients"
      description="Clients can view and add comments. Only you can resolve, edit or delete them."
      testId="share-dialog"
      fitKeyboard
    >
      {/* Always present, so the change is announced when the link view replaces Create. */}
      <p role="status" className="sr-only">
        {linked ? "Link created." : ""}
      </p>
      {linked && share && url ? (
        <div ref={linkedView} className="flex flex-col gap-4">
          <CopyLinkField
            url={url}
            label="Share link"
            openLabel={null}
            testId="share-url"
            className=""
          />
          <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-meta ${syncTone}`}>
            <Icon name={syncIcon} className="size-4 shrink-0" />
            {/* Only the status text is live: the Retry button isn't announced on every change. */}
            <p role="status" data-testid="sync-status">
              {syncLine(status, share, now)}
            </p>
            {failing ? (
              <Button variant="ghost" size="sm" onClick={onRetry}>
                Retry now
              </Button>
            ) : null}
          </div>
          <ReviewWindowControl
            value={reviewWindow}
            onChange={onReviewWindowChange}
            saving={savingWindow}
            error={windowError}
            disabled={revoking}
            describedBy={reviewLineId}
          />
          <p
            id={reviewLineId}
            data-testid="review-window"
            className="-mt-2 flex items-start gap-2 text-meta text-muted"
          >
            <Icon name="clock" className="mt-0.5 size-4 shrink-0" />
            {reviewLine(share, now)}
          </p>
          <SharePasswordControl
            passwordSetAt={share.passwordSetAt}
            onChange={onPasswordChange}
            disabled={revoking}
          />
          <div className="flex justify-end border-t border-line pt-4">
            <Button
              variant="danger"
              size="sm"
              aria-disabled={revoking || undefined}
              onClick={revoking ? undefined : onRevoke}
              data-return-focus="revoke"
            >
              <Icon name="trash" className="size-4" />
              {revoking ? "Revoking…" : "Revoke link"}
            </Button>
          </div>
        </div>
      ) : (
        <div ref={createView} className="flex flex-col items-start gap-3">
          {gone ? (
            <p role="alert" className="text-body text-muted">
              This project&apos;s share link no longer works. It was revoked, or the server no
              longer has it. Create a new link to share again.
            </p>
          ) : (
            <p className="text-body text-muted">
              Anyone with the link can open this project. Their comments come back here.
            </p>
          )}
          <ReviewWindowControl
            value={reviewWindow}
            onChange={onReviewWindowChange}
            saving={false}
            error={null}
            disabled={creating}
          />
          {/* aria-disabled while busy, so keyboard focus stays here if creating fails. */}
          <Button
            onClick={blocked ? undefined : onCreate}
            aria-disabled={blocked || undefined}
            aria-describedby={errorId}
            data-view-focus
            data-testid="create-share-link"
          >
            <Icon name="link" className="size-4" />
            {createLabel}
          </Button>
          <FieldError id={errorId} message={fit.status === "too-big" ? fit.message : error} />
        </div>
      )}
    </Dialog>
  );
}
