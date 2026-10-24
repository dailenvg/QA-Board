"use client";

import { relativeTime } from "@/lib/relative-time";
import type { SyncStatus } from "@/lib/share-client/owner-sync";
import type { ProjectShare } from "@/lib/store/types";
import { useNow } from "@/lib/use-now";
import { CopyLinkField } from "../review-link/CopyLinkField";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { FieldError } from "../ui/FieldError";
import { Icon } from "../ui/Icon";

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  share: ProjectShare | undefined;
  url: string | null;
  status: SyncStatus;
  creating: boolean;
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
  const at = Math.max(status.checkedAt ?? 0, share.lastSyncedAt ?? 0);
  return at ? `Synced ${relativeTime(at, now)}` : "Not synced yet";
}

/** Owner's share settings: create the link, copy it, see sync status, revoke it. */
export function ShareDialog({
  open,
  onClose,
  share,
  url,
  status,
  creating,
  error,
  onCreate,
  onRetry,
  onRevoke,
}: ShareDialogProps) {
  const now = useNow();
  const gone = status.phase === "gone";
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Share with clients"
      description="Clients can view and add comments. Only you can resolve, edit or delete them."
      testId="share-dialog"
    >
      {share && url && !gone ? (
        <div className="flex flex-col gap-4">
          <CopyLinkField
            url={url}
            label="Review link"
            openLabel={null}
            testId="share-url"
            className=""
          />
          <p
            role="status"
            className="flex items-center gap-2 text-meta text-muted"
            data-testid="sync-status"
          >
            <Icon name={status.phase === "error" ? "alert" : "refresh"} className="size-4" />
            {syncLine(status, share, now)}
            {status.phase === "error" ? (
              <Button variant="ghost" size="sm" onClick={onRetry}>
                Retry now
              </Button>
            ) : null}
          </p>
          <div className="flex justify-end border-t border-line pt-4">
            <Button variant="danger" size="sm" onClick={onRevoke}>
              <Icon name="trash" className="size-4" />
              Revoke link
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3">
          {gone ? (
            <p role="alert" className="text-body text-muted">
              This project&apos;s link no longer works. It was revoked, or the server no longer has
              it. Create a new link to share again.
            </p>
          ) : (
            <p className="text-body text-muted">
              Anyone with the link can open this project. Their comments come back here.
            </p>
          )}
          <Button onClick={onCreate} disabled={creating} data-testid="create-share-link">
            <Icon name="link" className="size-4" />
            {creating ? "Creating link…" : gone ? "Create a new link" : "Create link"}
          </Button>
          <FieldError id="share-error" message={error} />
        </div>
      )}
    </Dialog>
  );
}
