"use client";

import { useState } from "react";
import { inviteError, sentMessage, type InviteResult } from "@/lib/share-client/invites";
import { useRetryWait } from "@/lib/share-client/use-retry-wait";
import { markChips, sendableChips, type InviteChip } from "./invite-chips";

type Failure = Exclude<InviteResult, { ok: true }>;

/** Refusals the chips explain themselves (they're marked): no separate message. */
const ON_CHIPS: ReadonlySet<Failure["reason"]> = new Set(["invalid-addresses", "members-only"]);

export interface ShareInvites {
  chips: InviteChip[];
  setChips: (chips: InviteChip[]) => void;
  sending: boolean;
  /** Why the last send didn't go, when it isn't about particular chips; null otherwise. */
  error: string | null;
  /** What the last refusal was, for its way out (Settings, after a closed window). */
  failure: Failure["reason"] | null;
  /** Seconds left of a rate limit's wait; 0 when there's none. */
  waitSeconds: number;
  /** Something to send, nothing wrong with it, and nothing in the way. */
  ready: boolean;
  send: () => Promise<void>;
}

interface Options {
  /** Which link the chips are for: they're forgotten when it changes (revoked, recreated). */
  shareId: string | null;
  onSend: (addresses: string[]) => Promise<InviteResult>;
  /** Said after a send went (a toast). */
  onSent: (message: string) => void;
}

/**
 * The Share window's email invites: its chips, sending them, and what came
 * of it. Kept above the dialog's body, so the chips survive a phone's tab
 * switch and a confirmation dialog.
 */
export function useShareInvites({ shareId, onSend, onSent }: Options): ShareInvites {
  const [draft, setDraft] = useState<{ shareId: string | null; chips: InviteChip[] }>({
    shareId,
    chips: [],
  });
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [waitSeconds, startWait] = useRetryWait();
  const chips = draft.shareId === shareId ? draft.chips : [];

  const setChips = (next: InviteChip[]) => {
    setDraft({ shareId, chips: next });
    // Changing the chips answers a refusal about them; a wait or a closed window stays.
    setFailure((current) => (current && ON_CHIPS.has(current.reason) ? null : current));
  };

  const send = async () => {
    if (sending || waitSeconds > 0 || !sendableChips(chips)) return;
    setSending(true);
    setFailure(null);
    const sentTo = chips;
    const result = await onSend(sentTo.map((chip) => chip.address));
    setSending(false);
    if (result.ok) {
      setDraft({ shareId, chips: [] });
      onSent(sentMessage(result.sent));
      return;
    }
    setFailure(result);
    if (result.reason === "invalid-addresses") {
      setDraft({ shareId, chips: markChips(sentTo, result.addresses, "invalid") });
    } else if (result.reason === "members-only") {
      setDraft({ shareId, chips: markChips(sentTo, result.addresses, "outside") });
    } else if (result.reason === "rate-limited") {
      startWait(result.retryAt);
    }
  };

  const waiting = waitSeconds > 0;
  const shown = failure && !ON_CHIPS.has(failure.reason) ? failure : null;
  // A wait that's over says nothing more.
  const error =
    shown && !(shown.reason === "rate-limited" && !waiting)
      ? inviteError(shown, waitSeconds)
      : null;
  return {
    chips,
    setChips,
    sending,
    error,
    failure: failure?.reason ?? null,
    waitSeconds,
    ready: sendableChips(chips) && !sending && !waiting,
    send,
  };
}
