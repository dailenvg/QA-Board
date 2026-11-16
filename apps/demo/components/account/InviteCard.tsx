"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, useRef } from "react";
import { usePopVariants } from "@/lib/motion";
import type { AskContext } from "@/lib/workspace-client/permission-copy";
import type { MembersData } from "@/lib/workspace/members/members-data";
import { FormAlert } from "../auth/FormAlert";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { InviteChipsField } from "../viewer/InviteChipsField";
import { removeChip } from "../viewer/invite-chips";
import { AlreadyInvited } from "./AlreadyInvited";
import { inviteFieldMessage } from "./invite-field-copy";
import { MEMBERS_COPY } from "./members-copy";
import { SeatMeter } from "./SeatMeter";
import { SeatsFullNotice } from "./SeatsFullNotice";
import { SettingsCard } from "./SettingsCard";
import type { InviteActions } from "./use-invite-actions";
import { useMemberInvites } from "./use-member-invites";

const COPY = MEMBERS_COPY.invite;

type ManagedData = Extract<MembersData, { view: "owner" | "manager" }>;

interface InviteCardProps {
  data: ManagedData;
  actions: InviteActions;
}

/**
 * Card A, "Invite people" (4b.2), for the owner and a member with the people
 * switch: the seats, then the field and Send, or, once every seat is taken,
 * a notice in their place. With email off it says so before the first
 * invite, and Send reads "Create invite".
 */
export function InviteCard({ data, actions }: InviteCardProps) {
  const variants = usePopVariants();
  const input = useRef<HTMLInputElement>(null);
  const alreadyId = useId();
  const blockerId = useId();
  const context: AskContext = { ownerName: data.ownerName, workspaceName: data.workspaceName };
  const invites = useMemberInvites({ seats: data.seats, context, actions, inputRef: input });
  const invited = data.invites.filter((invite) => !invite.expired).length;
  const full = invites.left === 0;
  return (
    <SettingsCard
      title={COPY.title}
      description={COPY.description(data.workspaceName, actions.emailEnabled)}
      icon="mail"
      testId="invite-card"
    >
      <SeatMeter seats={invites.seats} members={data.members.length} invited={invited} />
      {/*
       * No gap here: the live regions stay mounted, so a gap would count them even while
       * empty. Each takes its space only while it shows a message (`has-[p]`).
       */}
      <div className="flex flex-col">
        <AnimatePresence mode="wait" initial={false}>
          {full ? (
            <SeatsFullNotice
              key="full"
              seats={invites.seats}
              workspaceName={data.workspaceName}
              nothingSent={invites.nothingSent}
              takeFocus={invites.status !== null || invites.nothingSent}
            />
          ) : (
            <motion.div
              key="form"
              variants={variants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="flex flex-col gap-4"
            >
              {actions.emailEnabled ? null : (
                <FormAlert tone="note" message={COPY.emailOff} testId="invite-email-off" />
              )}
              <InviteChipsField
                chips={invites.chips}
                onChange={invites.setChips}
                readOnly={invites.sending}
                label={COPY.label}
                noun={COPY.noun}
                hint={COPY.hint(invites.left)}
                max={invites.left}
                describe={(chips, overflow) =>
                  inviteFieldMessage(chips, overflow, {
                    workspace: data.workspaceName,
                    left: invites.left,
                  })
                }
                describedBy={alreadyId}
                inputRef={input}
              />
              <AlreadyInvited
                id={alreadyId}
                chips={invites.chips}
                invites={data.invites}
                actions={actions}
                onResent={(address) => invites.setChips(removeChip(invites.chips, address))}
              />
              <div className="flex flex-col">
                {/* Under the field, over Send: why the last send didn't go. */}
                <FormAlert message={invites.error} testId="invite-error" className="has-[p]:mb-4" />
                <div className="flex justify-end">
                  <Button
                    onClick={invites.blocker === null ? () => void invites.send() : undefined}
                    aria-disabled={invites.blocker !== null || invites.sending || undefined}
                    aria-describedby={invites.blocker ? blockerId : undefined}
                    className="max-sm:w-full"
                    data-testid="send-member-invites"
                  >
                    <Icon name={actions.emailEnabled ? "send" : "link"} className="size-4" />
                    {COPY.send(invites.chips.length, invites.sending, actions.emailEnabled)}
                  </Button>
                  {invites.blocker ? (
                    <span id={blockerId} className="sr-only">
                      {invites.blocker}
                    </span>
                  ) : null}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Outside the swap: the last invite to fit still says where it went once the notice is up. */}
        <FormAlert
          tone="info"
          message={invites.status}
          testId="invite-status"
          className="has-[p]:mt-4"
        />
      </div>
    </SettingsCard>
  );
}
