"use client";

import { useRef, useState } from "react";
import { projectHref } from "@/lib/routes";
import type { ClickUpPerson } from "@/lib/integrations/clickup/api";
import type { ClickUpChannel } from "@/lib/integrations/clickup/chat-api";
import {
  forgetClickUpChannel,
  readLastClickUpChannel,
  rememberClickUpChannel,
} from "@/lib/integrations/clickup/last-channel";
import {
  loadClickUpChannels,
  loadClickUpPeople,
  sendToClickUp,
  type ClickUpListResult,
  type ClickUpRefused,
  type ClickUpSendError,
} from "@/lib/integrations/clickup/send-client";
import { CLICKUP_SEND_COPY, clickUpSendErrorMessage } from "./clickup-send-copy";

/** Why the window can't offer the form: the member has to act in their settings, or can't at all. */
export type ClickUpBlocked = "not-connected" | "reconnect" | "unavailable";

const BLOCKING: ReadonlySet<ClickUpSendError> = new Set([
  "not-connected",
  "reconnect",
  "unavailable",
]);

export type ClickUpLists =
  | { status: "loading" }
  | { status: "ready"; channels: ClickUpChannel[]; people: ClickUpPerson[] }
  | { status: "blocked"; reason: ClickUpBlocked }
  | { status: "error"; message: string };

export interface ClickUpDraft {
  channelId: string | null;
  assignee: string | null;
  note: string;
}

const EMPTY: ClickUpDraft = { channelId: null, assignee: null, note: "" };

/** A list that didn't load: the way to settings when it needs the member, else what went wrong. */
function refusedList(refused: ClickUpRefused): ClickUpLists {
  if (BLOCKING.has(refused.error)) {
    return { status: "blocked", reason: refused.error as ClickUpBlocked };
  }
  const reason = clickUpSendErrorMessage(refused.error, {
    retryAfterSeconds: refused.retryAfterSeconds,
  });
  return { status: "error", message: `${CLICKUP_SEND_COPY.loadFailed} ${reason}` };
}

/** The lists' state from both answers. */
function listsOf(
  channels: ClickUpListResult<ClickUpChannel>,
  people: ClickUpListResult<ClickUpPerson>,
): ClickUpLists {
  if (!channels.ok) return refusedList(channels);
  if (!people.ok) return refusedList(people);
  return { status: "ready", channels: channels.items, people: people.items };
}

/** The channels without the one ClickUp just refused, so it can't be picked again meanwhile. */
function withoutChannel(lists: ClickUpLists, channelId: string): ClickUpLists {
  if (lists.status !== "ready") return lists;
  return { ...lists, channels: lists.channels.filter(({ id }) => id !== channelId) };
}

/** The draft, kept to what the lists still have; the channel last sent to, when none is picked. */
function fitDraft(draft: ClickUpDraft, lists: ClickUpLists, lastChannel: string | null) {
  if (lists.status !== "ready") return draft;
  const channelIds = new Set(lists.channels.map(({ id }) => id));
  const people = new Set(lists.people.map(({ id }) => id));
  const channelId = [draft.channelId, lastChannel].find((id) => id && channelIds.has(id)) ?? null;
  return {
    ...draft,
    channelId,
    assignee: draft.assignee && people.has(draft.assignee) ? draft.assignee : null,
  };
}

interface UseClickUpSendOptions {
  workspaceId: string | null;
  projectId: string;
  /** A send went: the channel's name, and the message's link when ClickUp gave one. */
  onSent: (channel: string, url: string | null) => void;
  /**
   * The project's link was copied for pasting by hand: the channel it goes in,
   * and whether its tab opened (a browser can hold one back).
   */
  onCopied: (channel: ClickUpChannel, opened: boolean) => void;
}

/**
 * Send to ClickUp's state: the member's channels and ClickUp people (read
 * afresh each time the window opens, never kept beyond it), the draft
 * (channel, assignee, note), and sending it, or copying the link to paste
 * in the channel by hand (`copyAndOpen`). A refused token or a
 * missing connection turns the window into the way to settings. A channel
 * ClickUp refused (gone, or closed to the member) is said under the channel
 * list (`channelError`) and unpicked, and `repick` counts up so the form
 * moves focus there; a gone one is dropped and the channels read again in
 * place (`refreshing`), the form staying as it is.
 */
export function useClickUpSend({
  workspaceId,
  projectId,
  onSent,
  onCopied,
}: UseClickUpSendOptions) {
  const [lists, setLists] = useState<ClickUpLists>({ status: "loading" });
  const [draft, setDraft] = useState<ClickUpDraft>(EMPTY);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [repick, setRepick] = useState(0);
  /** Each load's number: only the latest one's answer is shown. */
  const loads = useRef(0);
  /** A copy is on its way: a second click meanwhile would open a second tab. */
  const copying = useRef(false);

  const load = async () => {
    const load = ++loads.current;
    setRefreshing(false);
    setLists({ status: "loading" });
    if (!workspaceId) {
      setLists({ status: "blocked", reason: "unavailable" });
      return;
    }
    const [channels, people] = await Promise.all([
      loadClickUpChannels(workspaceId),
      loadClickUpPeople(workspaceId),
    ]);
    if (load !== loads.current) return;
    const next = listsOf(channels, people);
    setLists(next);
    setDraft((current) => fitDraft(current, next, readLastClickUpChannel(workspaceId)));
  };

  /**
   * The channels read again with the form kept (no skeletons, so focus and the
   * draft stay put). Only a refusal that needs the member's settings changes
   * the view; any other failure keeps the list as it is.
   */
  const refreshChannels = async () => {
    if (!workspaceId) return;
    const load = ++loads.current;
    setRefreshing(true);
    const channels = await loadClickUpChannels(workspaceId);
    if (load !== loads.current) return;
    setRefreshing(false);
    if (!channels.ok) {
      if (BLOCKING.has(channels.error)) setLists(refusedList(channels));
      return;
    }
    const ids = new Set(channels.items.map(({ id }) => id));
    setLists((current) =>
      current.status === "ready" ? { ...current, channels: channels.items } : current,
    );
    setDraft((current) =>
      current.channelId && !ids.has(current.channelId) ? { ...current, channelId: null } : current,
    );
  };

  /** The window opened: fresh lists, and no leftover message from last time. */
  const start = () => {
    setError(null);
    setChannelError(null);
    void load();
  };

  const update = (change: Partial<ClickUpDraft>) => {
    setDraft((current) => ({ ...current, ...change }));
    if (change.channelId) setChannelError(null);
  };

  /** The channel picked; when there's none, says so under the list. */
  const pickedChannel = (): ClickUpChannel | null => {
    if (lists.status !== "ready") return null;
    const channel = lists.channels.find(({ id }) => id === draft.channelId) ?? null;
    if (!channel) setChannelError(CLICKUP_SEND_COPY.channel.required);
    return channel;
  };

  /**
   * Copies the project's link and opens the channel picked in ClickUp, where
   * pasting it shows its card (a message Squint sends shows a bare link).
   * Copied first, while the page still has focus; the tab opens after, so a
   * browser that holds it back still leaves the link copied. False when
   * nothing was copied (the reason shows).
   */
  const copyAndOpen = async (): Promise<boolean> => {
    if (copying.current || sending || lists.status !== "ready" || !workspaceId) return false;
    const channel = pickedChannel();
    if (!channel) return false;
    setError(null);
    copying.current = true;
    try {
      await navigator.clipboard.writeText(
        new URL(projectHref(projectId), window.location.origin).href,
      );
    } catch {
      setError(CLICKUP_SEND_COPY.paste.copyFailed);
      return false;
    } finally {
      copying.current = false;
    }
    rememberClickUpChannel(workspaceId, channel.id);
    // Not "noopener" in the features: then the tab is always null, and a blocked one can't be told.
    const tab = window.open(channel.url, "_blank");
    if (tab) tab.opener = null;
    onCopied(channel, tab !== null);
    return true;
  };

  /** False when nothing went (the reason shows); true once it's sent. */
  const send = async (): Promise<boolean> => {
    if (sending || lists.status !== "ready" || !workspaceId) return false;
    const channel = pickedChannel();
    if (!channel) return false;
    setSending(true);
    setError(null);
    const result = await sendToClickUp(workspaceId, projectId, {
      channelId: channel.id,
      note: draft.note,
      assignee: draft.assignee,
    });
    setSending(false);
    if (result.ok) {
      rememberClickUpChannel(workspaceId, channel.id);
      setDraft({ ...EMPTY, channelId: channel.id });
      onSent(channel.name, result.url);
      return true;
    }
    if (BLOCKING.has(result.error)) {
      setLists({ status: "blocked", reason: result.error as ClickUpBlocked });
      return false;
    }
    const message = clickUpSendErrorMessage(result.error, {
      retryAfterSeconds: result.retryAfterSeconds,
      channel: channel.name,
    });
    if (result.error === "channel-gone" || result.error === "channel-forbidden") {
      // Said under the channel list (where the next pick happens), which focus returns to.
      setChannelError(message);
      setDraft((current) => ({ ...current, channelId: null }));
      setRepick((count) => count + 1);
      if (workspaceId) forgetClickUpChannel(workspaceId, channel.id);
      if (result.error === "channel-gone") {
        setLists((current) => withoutChannel(current, channel.id));
        void refreshChannels();
      }
      return false;
    }
    setError(message);
    return false;
  };

  return {
    lists,
    draft,
    update,
    sending,
    error,
    channelError,
    refreshing,
    repick,
    start,
    retry: load,
    send,
    copyAndOpen,
  };
}
