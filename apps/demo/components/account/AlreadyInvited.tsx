"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePopVariants } from "@/lib/motion";
import type { PendingInvite } from "@/lib/workspace/members/members-data";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import type { InviteChip } from "../viewer/invite-chips";
import { MEMBERS_COPY } from "./members-copy";
import type { InviteActions } from "./use-invite-actions";

const COPY = MEMBERS_COPY.invite;

interface AlreadyInvitedProps {
  id: string;
  chips: readonly InviteChip[];
  invites: readonly PendingInvite[];
  actions: InviteActions;
  /** The address's chip leaves once its invite went again. */
  onResent: (address: string) => void;
}

/**
 * Under the invite field, one line per address that already has an invite
 * (4b.2), with the way on: the row menu's resend ("Resend email", or "Renew
 * link" with email off) right there. Said with the field (`id`).
 */
export function AlreadyInvited({ id, chips, invites, actions, onResent }: AlreadyInvitedProps) {
  const variants = usePopVariants();
  const listed = chips.filter((chip) => chip.problem === "already-invited");
  return (
    <ul id={id} className="flex flex-col gap-2 empty:hidden" data-testid="already-invited">
      <AnimatePresence initial={false}>
        {listed.map((chip) => {
          const invite = invites.find((entry) => entry.email === chip.address);
          const state = invite ? actions.resendState(invite) : "ready";
          const label = MEMBERS_COPY.invites.resend(state, false, actions.emailEnabled);
          const off = state !== "ready";
          return (
            <motion.li
              key={chip.address}
              variants={variants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-tile bg-danger-soft px-4 py-2 text-body text-danger"
            >
              <span className="flex min-w-0 items-start gap-2 font-medium">
                <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 wrap-anywhere">
                  {COPY.refused["already-invited"](chip.address)}
                </span>
              </span>
              {invite ? (
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={COPY.resendFor(label, chip.address)}
                  aria-disabled={off || undefined}
                  onClick={() => {
                    if (off) return;
                    void actions.resend(invite).then((result) => {
                      if (result === "done") onResent(chip.address);
                    });
                  }}
                  data-testid="already-invited-resend"
                >
                  {label}
                </Button>
              ) : null}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
