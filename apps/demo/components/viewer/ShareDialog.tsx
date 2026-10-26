"use client";

import { useEffect, useId, useRef } from "react";
import { relativeTime } from "@/lib/relative-time";
import { reviewDeadline, spokenTimeLeft, timeLeft } from "@/lib/share/review-window";
import type { SyncStatus } from "@/lib/share-client/owner-sync";
import type { ShareFit } from "@/lib/share-client/use-share-fit";
import type { ProjectShare } from "@/lib/store/types";
import { useNow } from "@/lib/use-now";
import { CopyLinkField } from "../review-link/CopyLinkField";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { FieldError } from "../ui/FieldError";
import { Icon, type IconName } from "../ui/Icon";

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

/** How long clients can still comment through the link (the window starts when it's created). */
function reviewLine(share: ProjectShare, now: number): string {
  const left = timeLeft(reviewDeadline(share.createdAt), now);
  return left
    ? `Clients can comment for ${spokenTimeLeft(left)} more.`
    : "Review window closed. Clients can still open the link, but can't add comments. To collect more feedback, revoke this link and create a new one.";
}

/**
 * Owner's share settings: create the link, copy it, see sync status and the
 * review window, revoke it.
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
  onCreate,
  onRetry,
  onRevoke,
}: ShareDialogProps) {
  const now = useNow();
  const errorId = useId();
  const gone = status.phase === "gone";
  // Never "Synced" while client additions are held back.
  const failing = status.phase === "error" || status.pullHeld;
  const busy = status.phase === "syncing" || Boolean(status.uploading);
  const synced = Boolean(status.checkedAt ?? share?.lastSyncedAt);
  // A check only once something has synced; "Not synced yet" keeps the neutral refresh icon.
  const syncIcon: IconName = failing ? "alert" : busy || !synced ? "refresh" : "check";
  const syncTone = failing ? "text-danger" : "text-muted";
  const linked = Boolean(share && url && !gone);
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
  const wasLinked = useRef(linked);

  // Creating the link replaces the focused Create button with the link view. Carry focus
  // to Copy, so it doesn't fall to the page behind the modal.
  useEffect(() => {
    if (open && linked && !wasLinked.current) {
      linkedView.current?.querySelector<HTMLElement>("button")?.focus();
    }
    wasLinked.current = linked;
  }, [open, linked]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Share with clients"
      description="Clients can view and add comments. Only you can resolve, edit or delete them."
      testId="share-dialog"
    >
      {/* Always present, so the change is announced when the link view replaces Create. */}
      <p role="status" className="sr-only">
        {linked ? "Link created." : ""}
      </p>
      {share && url && !gone ? (
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
          <p
            data-testid="review-window"
            className="-mt-2 flex items-start gap-2 text-meta text-muted"
          >
            <Icon name="clock" className="mt-0.5 size-4 shrink-0" />
            {reviewLine(share, now)}
          </p>
          <div className="flex justify-end border-t border-line pt-4">
            <Button
              variant="danger"
              size="sm"
              aria-disabled={revoking || undefined}
              onClick={revoking ? undefined : onRevoke}
            >
              <Icon name="trash" className="size-4" />
              {revoking ? "Revoking…" : "Revoke link"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3">
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
          {/* aria-disabled while busy, so keyboard focus stays here if creating fails. */}
          <Button
            onClick={blocked ? undefined : onCreate}
            aria-disabled={blocked || undefined}
            aria-describedby={errorId}
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
