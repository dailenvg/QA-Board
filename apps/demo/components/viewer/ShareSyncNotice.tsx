"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePopVariants } from "@/lib/motion";
import type { SyncStatus } from "@/lib/share-client/owner-sync";
import type { ProjectShare } from "@/lib/store/types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

interface ShareSyncNoticeProps {
  share: ProjectShare;
  status: SyncStatus;
  onRetry: () => void;
}

function failureLine(status: SyncStatus): string {
  return status.pullHeld
    ? "Some client comments haven't arrived yet. Retrying…"
    : "Changes haven't reached the link yet. Retrying…";
}

/**
 * Only what needs the owner's eye: images still uploading, or a link out of
 * sync (with Retry). Nothing while the link is in sync. `data-sync` says
 * which, for tests.
 */
export function ShareSyncNotice({ share, status, onRetry }: ShareSyncNoticeProps) {
  const variants = usePopVariants();
  // Never "synced" while client additions are held back.
  const failing = status.phase === "error" || status.pullHeld;
  const busy = status.phase === "syncing" || Boolean(status.uploading);
  const synced = Boolean(status.checkedAt ?? share.lastSyncedAt);
  const state = failing ? "failing" : busy ? "syncing" : synced ? "synced" : "waiting";
  const uploading = !failing ? status.uploading : undefined;
  return (
    // Takes no room (no gap in the step) while there's nothing to say.
    <div data-testid="share-sync" data-sync={state} className="empty:hidden">
      <AnimatePresence initial={false}>
        {failing ? (
          <motion.div
            key="failing"
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-danger"
          >
            <Icon name="alert" className="size-4 shrink-0" />
            {/* Only the text is read out: the Retry button isn't announced with it. */}
            <p role="alert">{failureLine(status)}</p>
            <Button variant="ghost" size="sm" onClick={onRetry}>
              Retry now
            </Button>
          </motion.div>
        ) : uploading ? (
          <motion.div
            key="uploading"
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex items-center gap-2 text-meta text-muted"
          >
            <Icon name="refresh" className="size-4 shrink-0" />
            <p role="status">
              Uploading images: {uploading.done} of {uploading.total}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
