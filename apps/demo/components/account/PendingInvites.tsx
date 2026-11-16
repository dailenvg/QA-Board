"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, useRef, useState } from "react";
import { cancelMemberInvite, membersErrorMessage } from "@/lib/account/members-client";
import { staggerGroup, usePopVariants } from "@/lib/motion";
import type { AskContext } from "@/lib/workspace-client/permission-copy";
import type { PendingInvite } from "@/lib/workspace/members/members-data";
import type { MenuHandle } from "../ui/Menu";
import { useToast } from "../ui/ToastProvider";
import { InviteRow } from "./InviteRow";
import { MEMBERS_COPY } from "./members-copy";
import type { InviteActions } from "./use-invite-actions";

const COPY = MEMBERS_COPY.invites;
const GROUP = staggerGroup();

/** A row's key, as card B finds rows to move focus between. */
export const inviteKey = (invite: PendingInvite) => `invite:${invite.id}`;

interface PendingInvitesProps {
  invites: readonly PendingInvite[];
  actions: InviteActions;
  context: AskContext;
  /** Copies an invite's link (synchronously, inside the tap). */
  onCopy: (email: string, link: string) => void;
  /** The row went (cancelled): say so, refresh, move focus on. */
  onLeave: (key: string, message: string) => void;
  /** The row may be out of date (changed elsewhere, or not allowed now): focus on once it's refreshed. */
  onStale: (key: string) => void;
}

/**
 * Card B's "Pending invites" (4b.2), for the owner and a member with the
 * people switch, whoever sent each (D2): every open invite, expired ones
 * included, each with its menu. Left out entirely when there are none.
 * Nothing is optimistic: a row leaves once the server has cancelled it.
 */
export function PendingInvites({
  invites,
  actions,
  context,
  onCopy,
  onLeave,
  onStale,
}: PendingInvitesProps) {
  const toast = useToast();
  const variants = usePopVariants();
  const headingId = useId();
  const menus = useRef(new Map<string, MenuHandle>());
  const [cancelling, setCancelling] = useState<ReadonlySet<string>>(new Set());

  const setCancellingFor = (id: string, on: boolean) =>
    setCancelling((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const resend = async (invite: PendingInvite) => {
    const result = await actions.resend(invite);
    // Sent from elsewhere a moment ago: the menu stays, its item now says so and waits.
    if (result === "cooldown") return;
    menus.current.get(invite.id)?.close();
    if (result === "changed" || result === "not-allowed") onStale(inviteKey(invite));
  };

  const cancel = async (invite: PendingInvite) => {
    if (cancelling.has(invite.id)) return;
    setCancellingFor(invite.id, true);
    const outcome = await cancelMemberInvite(invite.id);
    setCancellingFor(invite.id, false);
    menus.current.get(invite.id)?.close();
    if (outcome.ok) {
      onLeave(inviteKey(invite), COPY.cancelled(invite.email));
      return;
    }
    const action = { kind: "cancel", email: invite.email } as const;
    toast({ message: membersErrorMessage(outcome.error, action, context), tone: "error" });
    if (outcome.error === "changed" || outcome.error === "not-allowed") {
      onStale(inviteKey(invite));
    }
  };

  if (invites.length === 0) return null;
  return (
    // Pops in with the first invite, and out (in card B's presence) once the last one goes.
    <motion.section
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      aria-labelledby={headingId}
      className="flex flex-col gap-2"
      data-testid="pending-invites"
    >
      <h3 id={headingId} className="px-3 text-meta font-semibold text-muted">
        {COPY.title}
      </h3>
      <motion.ul
        variants={GROUP}
        initial="hidden"
        animate="visible"
        aria-labelledby={headingId}
        className="flex flex-col gap-1"
      >
        <AnimatePresence>
          {invites.map((invite) => (
            <InviteRow
              key={invite.id}
              invite={invite}
              emailEnabled={actions.emailEnabled}
              now={actions.now}
              resendState={actions.resendState(invite)}
              cancelling={cancelling.has(invite.id)}
              menu={(handle) => {
                if (handle) menus.current.set(invite.id, handle);
                else menus.current.delete(invite.id);
              }}
              onCopy={() => {
                if (invite.link) onCopy(invite.email, invite.link);
              }}
              onResend={() => void resend(invite)}
              onCancel={() => void cancel(invite)}
            />
          ))}
        </AnimatePresence>
      </motion.ul>
    </motion.section>
  );
}
