"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, type ComponentProps } from "react";
import { usePopVariants } from "@/lib/motion";
import type { SyncStatus } from "@/lib/share-client/owner-sync";
import { minutesLeft, sendLabel, sentToLine } from "@/lib/share-client/invites";
import type { ProjectShare } from "@/lib/store/types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { InviteChipsField } from "./InviteChipsField";
import { ShareClientNameField } from "./ShareClientNameField";
import { ShareLinkLine } from "./ShareLinkLine";
import { ShareOtherWays } from "./ShareOtherWays";
import { ShareStep } from "./ShareStep";
import type { ShareInvites } from "./use-share-invites";

interface ShareInviteStepProps {
  /** Null on a phone's tab, which needs no number. */
  step: number | null;
  clientName: ComponentProps<typeof ShareClientNameField>;
  invites: ShareInvites;
  /** Why invitations can't go now (the review window closed), or null. */
  closed: string | null;
  /** Takes the owner to the review window, to open the review again. */
  onOpenSettings: () => void;
  /** The invitation as a message, and its subject, for the other ways. */
  message: string;
  subject: string;
  url: string;
  share: ProjectShare;
  status: SyncStatus;
  onRetry: () => void;
}

/** Why Send is off, read with it. */
function sendBlocker(invites: ShareInvites, closed: string | null): string | null {
  if (closed) return closed;
  if (invites.waitSeconds > 0) return `Wait ${minutesLeft(invites.waitSeconds)} to send more.`;
  if (invites.chips.length === 0) return "Add at least one email address to send.";
  if (!invites.ready && !invites.sending) return "Remove the marked addresses first.";
  return null;
}

/**
 * Step 1, who's reviewing and how it reaches them: the client's name, then
 * email (the main way: chips and Send, with how many people it has reached),
 * then the other ways (ClickUp, Slack, Messages, Copy link), and the link
 * itself, quiet, with its sync status.
 */
export function ShareInviteStep({
  step,
  clientName,
  invites,
  closed,
  onOpenSettings,
  message,
  subject,
  url,
  share,
  status,
  onRetry,
}: ShareInviteStepProps) {
  const variants = usePopVariants();
  const blockerId = useId();
  const errorId = useId();
  const blocker = sendBlocker(invites, closed);
  const count = invites.chips.length;
  const invited = share.invitedCount ?? 0;
  const error = closed ?? invites.error;
  const showSettings = closed !== null || invites.failure === "review-closed";
  return (
    <ShareStep step={step} title="Who's reviewing?" testId="share-invite-step">
      <ShareClientNameField {...clientName} />
      <InviteChipsField
        chips={invites.chips}
        onChange={invites.setChips}
        readOnly={invites.sending}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-meta text-muted" data-testid="invites-sent">
          <Icon name={invited ? "check" : "mail"} className="size-4 shrink-0" />
          {sentToLine(invited)}
        </p>
        <Button
          // Off while anything's in the way (a closed window included): only the reason is read.
          onClick={blocker === null ? () => void invites.send() : undefined}
          aria-disabled={blocker !== null || invites.sending || undefined}
          aria-describedby={
            `${blocker ? blockerId : ""} ${error ? errorId : ""}`.trim() || undefined
          }
          className="max-sm:w-full"
          data-testid="send-invites"
        >
          <Icon name="send" className="size-4" />
          {sendLabel(count, invites.sending)}
        </Button>
        {blocker ? (
          <span id={blockerId} className="sr-only">
            {blocker}
          </span>
        ) : null}
      </div>
      <AnimatePresence initial={false}>
        {error ? (
          <motion.div
            key="invite-error"
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="alert"
            id={errorId}
            className="flex flex-col items-start gap-2 rounded-tile bg-danger-soft p-3 text-meta text-danger"
            data-testid="invite-error"
          >
            <p className="flex items-start gap-2">
              <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </p>
            {showSettings ? (
              <Button variant="secondary" size="sm" onClick={onOpenSettings}>
                Go to settings
              </Button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <ShareOtherWays message={message} url={url} title={subject} unavailable={closed} />
      <ShareLinkLine url={url} share={share} status={status} onRetry={onRetry} />
    </ShareStep>
  );
}
