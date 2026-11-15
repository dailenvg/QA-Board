"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePopVariants } from "@/lib/motion";
import type { SyncStatus } from "@/lib/share-client/owner-sync";
import type { ProjectShare } from "@/lib/store/types";
import { Icon } from "../ui/Icon";
import { ShareOtherWays } from "./ShareOtherWays";
import { ShareStep } from "./ShareStep";
import { ShareSyncNotice } from "./ShareSyncNotice";

interface ShareReadOnlyStepProps {
  /** The invitation as a message, for Messages. */
  message: string;
  url: string;
  /** Why the link can't take comments now (its review window closed), or null. */
  closed: string | null;
  /** Who can change or end the link: the owner by name, or "the workspace's owner". */
  owner: string;
  share: ProjectShare;
  status: SyncStatus;
  onRetry: () => void;
}

/**
 * The Share window for a member without the review-links switch: the link
 * goes out (Messages, Copy link) and stays in sync, but its client, invites,
 * settings and Revoke are the people's with the switch. One line says who to
 * ask.
 */
export function ShareReadOnlyStep({
  message,
  url,
  closed,
  owner,
  share,
  status,
  onRetry,
}: ShareReadOnlyStepProps) {
  const variants = usePopVariants();
  return (
    <ShareStep step={null} title="Send this link" testId="share-read-only-step">
      {/* The window can close while this is open (the clock ticks past it): it pops in, as
          the editable step's notice does, and out again if the owner reopens it. */}
      <AnimatePresence initial={false}>
        {closed ? (
          <motion.p
            key="closed"
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="alert"
            className="flex items-start gap-2 rounded-tile bg-danger-soft p-3 text-meta text-danger"
            data-testid="share-read-only-closed"
          >
            <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
            <span>{closed}</span>
          </motion.p>
        ) : null}
      </AnimatePresence>
      <ShareOtherWays message={message} url={url} unavailable={closed} heading={false} />
      <p className="text-meta text-muted" data-testid="share-read-only-note">
        You can copy and send this link. To change or end it, ask {owner}.
      </p>
      <ShareSyncNotice share={share} status={status} onRetry={onRetry} />
    </ShareStep>
  );
}
