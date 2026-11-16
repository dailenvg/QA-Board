"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Ref } from "react";
import { instant, spring, usePopVariants } from "@/lib/motion";
import type { PendingInvite } from "@/lib/workspace/members/members-data";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Menu, type MenuHandle, type MenuItem } from "../ui/Menu";
import { MEMBERS_COPY, type ResendState } from "./members-copy";
import { useDeleteDate } from "./use-delete-date";

const COPY = MEMBERS_COPY.invites;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `MemberRow`'s geometry: not a link, only the row's own controls react. */
const ROW = "flex min-h-11 items-center gap-3 rounded-row px-3 py-2";

const CHIP = "shrink-0 rounded-pill px-2 py-0.5 text-label font-semibold";

interface InviteRowProps {
  invite: PendingInvite;
  emailEnabled: boolean;
  /** The time "Expires in" counts from. */
  now: number;
  resendState: ResendState;
  /** Cancelling it is under way: its item says so. */
  cancelling: boolean;
  menu: Ref<MenuHandle>;
  onCopy: () => void;
  onResend: () => void;
  onCancel: () => void;
}

/**
 * A pending invite in card B (4b.2): a dashed mail circle where the avatar
 * goes, the address with "Invited" or "Expired", who invited them and when
 * it expires, and, when its last email didn't go out, a mark and Copy link
 * right on the row. Its menu copies the link, resends (or renews) and cancels.
 */
export function InviteRow({
  invite,
  emailEnabled,
  now,
  resendState,
  cancelling,
  menu,
  onCopy,
  onResend,
  onCancel,
}: InviteRowProps) {
  const reduce = useReducedMotion();
  const variants = usePopVariants();
  const resendBlocked = ["just-sent", "no-seat", "limited"].includes(resendState);
  const items: MenuItem[] = [
    ...(invite.link
      ? [
          {
            label: COPY.copyInviteLink,
            icon: "copy",
            onSelect: onCopy,
            testId: "invite-copy",
          } as const,
        ]
      : []),
    {
      id: "resend",
      label: COPY.resend(resendState, invite.expired, emailEnabled),
      icon: emailEnabled ? "send" : "refresh",
      keepOpen: true,
      busy: resendState === "busy",
      disabled: resendBlocked,
      onSelect: onResend,
      testId: "invite-resend",
    },
    {
      id: "cancel",
      label: cancelling ? COPY.cancelling : COPY.cancel,
      icon: "close",
      danger: true,
      separatorBefore: true,
      keepOpen: true,
      busy: cancelling,
      onSelect: onCancel,
      testId: "invite-cancel",
    },
  ];
  return (
    <motion.li
      layout="position"
      variants={variants}
      exit="exit"
      transition={reduce ? instant : spring.snappy}
      className={ROW}
      data-testid="invite-row"
      data-row-key={`invite:${invite.id}`}
      data-expired={invite.expired || undefined}
    >
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-pill border border-dashed border-line-strong text-muted"
      >
        <Icon name="mail" className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {/* Phones show the whole address, wrapped; wider rows have room, so it truncates. */}
          <span
            className="min-w-0 truncate text-nav font-semibold text-ink max-sm:whitespace-normal max-sm:wrap-anywhere"
            title={invite.email}
            data-testid="invite-email"
          >
            {invite.email}
          </span>
          <span
            className={`${CHIP} ${invite.expired ? "bg-warning-soft text-warning-text" : "bg-brand-soft text-brand-text"}`}
            data-testid="invite-chip"
          >
            {invite.expired ? COPY.expired : COPY.invited}
          </span>
        </div>
        <InviteMeta invite={invite} now={now} />
        {invite.emailNotSent && invite.link ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
            <span
              className="flex items-center gap-2 text-meta font-semibold text-warning-text"
              data-testid="invite-not-sent"
            >
              <Icon name="alert" className="size-4 shrink-0" />
              {COPY.emailNotSent}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={onCopy}
              aria-label={COPY.copyLinkFor(invite.email)}
              data-testid="invite-copy-inline"
            >
              <Icon name="copy" className="size-4" />
              {COPY.copyLink}
            </Button>
          </div>
        ) : null}
      </div>
      <Menu
        label={COPY.actions(invite.email)}
        icon="moreVertical"
        items={items}
        handle={menu}
        testId="invite-menu"
        className="shrink-0"
      />
    </motion.li>
  );
}

/** "Invited by Ana Ruiz · Expires in 5 days", or "Expired on Nov 3, 2026". */
function InviteMeta({ invite, now }: { invite: PendingInvite; now: number }) {
  const date = useDeleteDate(invite.expiresAt);
  // Rounded: a link made a moment after the page was read still works "7 days", never "8".
  const days = Math.max(1, Math.round((invite.expiresAt - now) / DAY_MS));
  const when = (
    <time dateTime={new Date(invite.expiresAt).toISOString()} title={date}>
      {invite.expired ? COPY.expiredOn(date) : COPY.expiresIn(days)}
    </time>
  );
  return (
    <span className="text-meta text-muted wrap-anywhere" data-testid="invite-meta">
      {invite.invitedBy ? `${COPY.invitedBy(invite.invitedBy)} · ` : null}
      {when}
    </span>
  );
}
