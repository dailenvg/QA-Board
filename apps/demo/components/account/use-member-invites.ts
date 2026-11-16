"use client";

import { useRouter } from "next/navigation";
import { useState, type RefObject } from "react";
import {
  emailLimitMessage,
  inviteMembers,
  membersErrorMessage,
  seatsFullMessage,
  type MembersError,
} from "@/lib/account/members-client";
import type { AskContext } from "@/lib/workspace-client/permission-copy";
import type { InviteAddressError, InviteResult } from "@/lib/workspace/members/create-invites";
import { seatsLeft, type Seats } from "@/lib/workspace/members/seats";
import { useToast } from "../ui/ToastProvider";
import { markChips, type InviteChip } from "../viewer/invite-chips";
import { MEMBERS_COPY } from "./members-copy";
import type { InviteActions } from "./use-invite-actions";

const COPY = MEMBERS_COPY.invite;

/** Refusals the line under the field explains while they last; others go once the chips change. */
const LASTING: ReadonlySet<MembersError> = new Set(["rate-limited", "seats-full"]);

export interface MemberInvites {
  chips: InviteChip[];
  setChips: (chips: InviteChip[]) => void;
  sending: boolean;
  /** The seats as last known: the page's, or a refusal's newer count until the page catches up. */
  seats: Seats;
  /** Seats left for new invites: the field's cap. */
  left: number;
  /** Why Send is off, read with it; null when it's on. */
  blocker: string | null;
  /** Why the last send didn't go, under the field; null otherwise. */
  error: string | null;
  /** What the last send did, as a status line; null before one. */
  status: string | null;
  /** The last send was refused for want of seats: the seats-full notice says nothing went. */
  nothingSent: boolean;
  send: () => Promise<void>;
}

interface Options {
  seats: Seats;
  context: AskContext;
  actions: InviteActions;
  /** The field, which keeps focus once a send went. */
  inputRef: RefObject<HTMLInputElement | null>;
}

/** The chips the server refused, each marked with its reason. */
function markRefused(chips: readonly InviteChip[], results: readonly InviteResult[]): InviteChip[] {
  const sent = new Set(results.filter((result) => result.ok).map((result) => result.email));
  const byReason = new Map<InviteAddressError, string[]>();
  for (const result of results) {
    if (result.ok) continue;
    byReason.set(result.error, [...(byReason.get(result.error) ?? []), result.email]);
  }
  let next = chips.filter((chip) => !sent.has(chip.address));
  for (const [reason, addresses] of byReason) next = markChips(next, addresses, reason);
  return next;
}

/** The status line after a send: who it went to (or that their emails didn't), and who it didn't. */
function doneLine(results: readonly InviteResult[], emailEnabled: boolean): string {
  const sent = results.filter((result) => result.ok);
  const refused = results.length - sent.length;
  const notEmailed = emailEnabled && sent.some((result) => !result.emailed);
  const head = notEmailed
    ? COPY.notEmailed(sent.length)
    : COPY.done(
        sent.map((result) => result.email),
        0,
        emailEnabled,
      );
  return [head, COPY.done([], refused, emailEnabled)].filter(Boolean).join(" ");
}

/**
 * Card A's field and Send (4b.2): the chips typed, one batch request, then
 * each address's result on its chip. Nothing is optimistic: invites appear
 * in the list once the server has made them. A refused send keeps every chip.
 */
export function useMemberInvites({ seats, context, actions, inputRef }: Options): MemberInvites {
  const router = useRouter();
  const toast = useToast();
  const [chips, setChipsState] = useState<InviteChip[]>([]);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<MembersError | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [nothingSent, setNothingSent] = useState(false);
  // A seats-full answer's count, kept only while the page's data is the one it corrected.
  const [refusedSeats, setRefusedSeats] = useState<{ over: Seats; seats: Seats } | null>(null);
  const known = refusedSeats?.over === seats ? refusedSeats.seats : seats;
  const left = seatsLeft(known);
  const waiting = actions.emailEnabled && actions.emailWait > 0;
  const limitLine = emailLimitMessage(actions.sentInWindow, actions.emailWait);

  const setChips = (next: InviteChip[]) => {
    setChipsState(next);
    setFailure((current) => (current && LASTING.has(current) ? current : null));
  };

  const blocker = (() => {
    if (waiting) return limitLine;
    if (chips.length === 0) return COPY.blocker.empty;
    if (chips.length > left) return seatsFullMessage(left, chips.length);
    const marked = chips.filter((chip) => chip.problem).length;
    return marked ? COPY.blocker.marked(marked) : null;
  })();

  const error = (() => {
    if (failure === "rate-limited") return waiting ? limitLine : null;
    if (failure === "seats-full") {
      return chips.length > left ? seatsFullMessage(left, chips.length) : null;
    }
    return failure
      ? membersErrorMessage(failure, { kind: "invite", addresses: chips.length }, context)
      : null;
  })();

  const send = async () => {
    if (sending || blocker) return;
    setSending(true);
    setFailure(null);
    setStatus(null);
    setNothingSent(false);
    const outcome = await inviteMembers(chips.map((chip) => chip.address));
    setSending(false);
    if (!outcome.ok) {
      setFailure(outcome.error);
      if (outcome.error === "rate-limited") {
        actions.limitEmails(outcome.retryAfterSeconds ?? 0, outcome.sentInWindow ?? 0);
      }
      if (outcome.error === "seats-full") {
        setNothingSent(true);
        if (outcome.seats) setRefusedSeats({ over: seats, seats: outcome.seats });
      }
      // The refresh takes this card away: the line stays on as a toast once it has.
      if (outcome.error === "not-allowed") {
        toast({
          message: membersErrorMessage("not-allowed", { kind: "invite", addresses: 0 }, context),
          tone: "error",
        });
      }
      if (outcome.error === "seats-full" || outcome.error === "not-allowed") router.refresh();
      return;
    }
    const emailed = outcome.results.flatMap((result) =>
      result.ok && result.emailed ? [result.invite.id] : [],
    );
    if (emailed.length) actions.markSent(emailed);
    setChipsState(markRefused(chips, outcome.results));
    setStatus(doneLine(outcome.results, actions.emailEnabled));
    inputRef.current?.focus();
    router.refresh();
  };

  return {
    chips,
    setChips,
    sending,
    seats: known,
    left,
    blocker,
    error,
    status,
    nothingSent,
    send,
  };
}
