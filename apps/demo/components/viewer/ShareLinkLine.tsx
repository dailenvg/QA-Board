"use client";

import { useId } from "react";
import { relativeTime } from "@/lib/relative-time";
import type { SyncStatus } from "@/lib/share-client/owner-sync";
import type { ProjectShare } from "@/lib/store/types";
import { useNow } from "@/lib/use-now";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";

interface ShareLinkLineProps {
  url: string;
  share: ProjectShare;
  status: SyncStatus;
  onRetry: () => void;
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
 * The link itself, quiet under the ways to send it: read-only and selectable,
 * so people can check what they share, with whether the link is in sync (and
 * Retry when it isn't).
 */
export function ShareLinkLine({ url, share, status, onRetry }: ShareLinkLineProps) {
  const now = useNow();
  const inputId = useId();
  // Never "Synced" while client additions are held back.
  const failing = status.phase === "error" || status.pullHeld;
  const busy = status.phase === "syncing" || Boolean(status.uploading);
  const synced = Boolean(status.checkedAt ?? share.lastSyncedAt);
  // A check only once something has synced; "Not synced yet" keeps the neutral refresh icon.
  const syncIcon: IconName = failing ? "alert" : busy || !synced ? "refresh" : "check";
  return (
    <div className="flex flex-col gap-1 border-t border-line pt-3">
      <div className="flex min-w-0 items-center gap-2">
        <label htmlFor={inputId} className="shrink-0 text-meta font-semibold text-muted">
          Review link
        </label>
        <input
          id={inputId}
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          data-testid="share-url"
          className="min-h-11 min-w-0 flex-1 truncate rounded-field bg-transparent px-2 font-mono text-meta text-ink-2 hover:bg-hover focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
        />
      </div>
      <div
        className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-meta ${failing ? "text-danger" : "text-muted"}`}
      >
        {failing || busy ? (
          <Icon name={syncIcon} className="size-4 shrink-0" />
        ) : (
          <span
            aria-hidden="true"
            className={`size-2 shrink-0 rounded-pill ${synced ? "bg-resolved ring-4 ring-resolved-soft" : "bg-muted"}`}
          />
        )}
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
    </div>
  );
}
