"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  emailLimitMessage,
  membersErrorMessage,
  resendMemberInvite,
} from "@/lib/account/members-client";
import { useRetryWait } from "@/lib/share-client/use-retry-wait";
import { useNow } from "@/lib/use-now";
import type { AskContext } from "@/lib/workspace-client/permission-copy";
import { RESEND_COOLDOWN_MS } from "@/lib/workspace/members/invite-timing";
import type { PendingInvite } from "@/lib/workspace/members/members-data";
import { seatsLeft, type Seats } from "@/lib/workspace/members/seats";
import { useToast } from "../ui/ToastProvider";
import { MEMBERS_COPY, type ResendState } from "./members-copy";
import { localDate } from "./use-delete-date";

const COPY = MEMBERS_COPY.invites;

/** How a resend ended, for whoever asked: the row's menu, or an already-invited chip. */
export type ResendResult = "done" | "changed" | "not-allowed" | "cooldown" | "failed";

export interface InviteActions {
  emailEnabled: boolean;
  /** The time "Expires in" counts from: the page's read until the browser's clock ticks. */
  now: number;
  /** Seconds left of the day's email limit; 0 when there's none. */
  emailWait: number;
  /** How many invite emails went out in the last 24 hours, as the last refusal said. */
  sentInWindow: number;
  /** The day's invite emails ran out: wait `retryAfterSeconds`, `sentInWindow` went out. */
  limitEmails: (retryAfterSeconds: number, sentInWindow: number) => void;
  /** Its email just went out (made or resent here): Resend waits a minute. */
  markSent: (inviteIds: readonly string[]) => void;
  resendState: (invite: PendingInvite) => ResendState;
  resend: (invite: PendingInvite) => Promise<ResendResult>;
}

interface Options {
  emailEnabled: boolean;
  invites: readonly PendingInvite[];
  seats: Seats;
  context: AskContext;
  /** When the page was read (epoch ms). */
  readAt: number;
}

/**
 * What both Members cards share about invites (4b.2): resending one (from its
 * row's menu or an already-invited chip) with a toast per outcome, the
 * minute after each email when Resend waits, and the day's email limit, which
 * also holds Send. Every outcome refreshes the page's data.
 */
export function useInviteActions({
  emailEnabled,
  invites,
  seats,
  context,
  readAt,
}: Options): InviteActions {
  const router = useRouter();
  const toast = useToast();
  const clock = useNow();
  const [emailWait, startEmailWait] = useRetryWait();
  const [sentInWindow, setSentInWindow] = useState(0);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [sentHere, setSentHere] = useState<ReadonlyMap<string, number>>(new Map());
  const [tick, setTick] = useState(0);
  const now = Math.max(clock || readAt, tick);

  const sentAt = (invite: PendingInvite) =>
    Math.max(invite.lastSentAt ?? 0, sentHere.get(invite.id) ?? 0);

  // Wakes when the next minute after an email is up, so its Resend comes back on time.
  const nextFree = emailEnabled
    ? Math.min(
        ...invites
          .map((invite) => sentAt(invite) + RESEND_COOLDOWN_MS)
          .filter((until) => until > now),
      )
    : Infinity;
  useEffect(() => {
    if (!Number.isFinite(nextFree)) return;
    const timer = window.setTimeout(() => setTick(nextFree), Math.max(0, nextFree - Date.now()));
    return () => window.clearTimeout(timer);
  }, [nextFree]);

  const limitEmails = (retryAfterSeconds: number, sent: number) => {
    setSentInWindow(sent);
    startEmailWait(Date.now() + retryAfterSeconds * 1000);
  };

  const markSent = (ids: readonly string[]) => {
    const at = Date.now();
    setSentHere((current) => new Map([...current, ...ids.map((id) => [id, at] as const)]));
  };

  const resendState = (invite: PendingInvite): ResendState => {
    if (busy.has(invite.id)) return "busy";
    if (invite.expired && seatsLeft(seats) < 1) return "no-seat";
    if (!emailEnabled) return "ready";
    if (emailWait > 0) return "limited";
    return now - sentAt(invite) < RESEND_COOLDOWN_MS ? "just-sent" : "ready";
  };

  const setBusyFor = (id: string, on: boolean) =>
    setBusy((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const resend = async (invite: PendingInvite): Promise<ResendResult> => {
    setBusyFor(invite.id, true);
    const outcome = await resendMemberInvite(invite.id);
    setBusyFor(invite.id, false);
    const action = { kind: "resend", email: invite.email } as const;
    if (outcome.ok) {
      const until = localDate(outcome.expiresAt);
      if (outcome.emailed) {
        markSent([invite.id]);
        toast({ message: COPY.resent(invite.email, until) });
      } else if (emailEnabled) {
        toast({ message: COPY.resendNotEmailed(invite.email, until), tone: "error" });
      } else {
        toast({ message: COPY.renewed(until) });
      }
      router.refresh();
      return "done";
    }
    if (outcome.error === "cooldown") {
      markSent([invite.id]);
      return "cooldown";
    }
    if (outcome.error === "rate-limited") {
      limitEmails(outcome.retryAfterSeconds ?? 0, outcome.sentInWindow ?? 0);
      toast({
        message: emailLimitMessage(outcome.sentInWindow ?? 0, outcome.retryAfterSeconds ?? 0),
        tone: "error",
      });
      return "failed";
    }
    toast({ message: membersErrorMessage(outcome.error, action, context, outcome), tone: "error" });
    if (outcome.error === "changed" || outcome.error === "not-allowed") {
      router.refresh();
      return outcome.error;
    }
    if (outcome.error === "seats-full") router.refresh();
    return "failed";
  };

  return {
    emailEnabled,
    now,
    emailWait,
    sentInWindow,
    limitEmails,
    markSent,
    resendState,
    resend,
  };
}
