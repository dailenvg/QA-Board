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
}

/** Squint's message in the channel: on its way, posted, or why it didn't go. */
export type ClickUpPost =
  | { status: "posting" }
  | { status: "posted" }
  /**
   * `again`: posting it again may work (Try again); `repick`: the channel
   * can't take it (gone, or closed to the member), so another is picked.
   */
  | { status: "failed"; message: string; next: "again" | "repick" };

/** What one click did, as the window's confirmation shows it. */
export interface ClickUpSent {
  channel: ClickUpChannel;
  /** The project's link, absolute: copied, or there to copy by hand. */
  link: string;
  /** The clipboard took the link. */
  copied: boolean;
  /** Who it's assigned to, by name; null for nobody. */
  assignee: string | null;
  post: ClickUpPost;
}

/** The link copied, as a promise that rejects (never throws) when the clipboard isn't there. */
function copyText(text: string): Promise<void> {
  try {
    return navigator.clipboard.writeText(text);
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

/** Channel `channel` in a new tab, cut off from this page. */
function openChannel(channel: ClickUpChannel) {
  window.open(channel.url, "_blank", "noopener,noreferrer");
}

/**
 * Send to ClickUp's state: the member's channels and ClickUp people (read
 * afresh each time the window opens, never kept beyond it), the draft
 * (channel, assignee, note), and sending it (`send`): one click copies the
 * project's link and opens the channel in ClickUp, where pasting it shows
 * its card, and posts Squint's message there (title, note, assignee). What
 * that did is `sent`, for the window's confirmation, with Copy link again,
 * Open ClickUp again and Try again. A refused token or a missing connection
 * turns the window into the way to settings. A channel ClickUp refused
 * (gone, or closed to the member) is said under the channel list
 * (`channelError`) and unpicked for when the member goes back to pick
 * another (`repick` counts up so the form moves focus there); a gone one is
 * dropped and the channels read again in place (`refreshing`).
 */
export function useClickUpSend({ workspaceId, projectId }: UseClickUpSendOptions) {
  const [lists, setLists] = useState<ClickUpLists>({ status: "loading" });
  const [draft, setDraft] = useState<ClickUpDraft>(EMPTY);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<ClickUpSent | null>(null);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [repick, setRepick] = useState(0);
  /** Each load's number: only the latest one's answer is shown. */
  const loads = useRef(0);
  /** The draft last posted, for Try again (the form may have moved on). */
  const posted = useRef<ClickUpDraft>(EMPTY);
  /** A send is under way: a second click before the window re-renders would open a second tab. */
  const busy = useRef(false);
  /** Each send's number: a window opened again meanwhile never shows the old one's answer. */
  const sends = useRef(0);
  /** Try again is posting: a second click in the same moment would post twice. */
  const reposting = useRef(false);

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

  /** The window opened: fresh lists, the form again, and no leftover message from last time. */
  const start = () => {
    sends.current += 1;
    busy.current = false;
    setSending(false);
    setSent(null);
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
   * Posts `message` to `channel` and says how it went. A refusal that needs
   * the member's settings turns the window into the way there (null); a
   * channel ClickUp refused is unpicked, said under the list, and forgotten.
   */
  const post = async (
    channel: ClickUpChannel,
    message: ClickUpDraft,
  ): Promise<ClickUpPost | null> => {
    if (!workspaceId) return null;
    const result = await sendToClickUp(workspaceId, projectId, {
      channelId: channel.id,
      note: message.note,
      assignee: message.assignee,
    });
    if (result.ok) {
      rememberClickUpChannel(workspaceId, channel.id);
      setDraft({ ...EMPTY, channelId: channel.id });
      return { status: "posted" };
    }
    if (BLOCKING.has(result.error)) {
      setSent(null);
      setLists({ status: "blocked", reason: result.error as ClickUpBlocked });
      return null;
    }
    const reason = clickUpSendErrorMessage(result.error, {
      retryAfterSeconds: result.retryAfterSeconds,
      channel: channel.name,
      said: result.said,
    });
    if (result.error === "channel-gone" || result.error === "channel-forbidden") {
      // Said under the channel list too, where the next pick happens.
      setChannelError(reason);
      setDraft((current) => ({ ...current, channelId: null }));
      setRepick((count) => count + 1);
      forgetClickUpChannel(workspaceId, channel.id);
      if (result.error === "channel-gone") {
        setLists((current) => withoutChannel(current, channel.id));
        void refreshChannels();
      }
      return { status: "failed", message: reason, next: "repick" };
    }
    return { status: "failed", message: reason, next: "again" };
  };

  /**
   * The window's Send. Copying the link and opening the channel both happen
   * here, before anything is awaited: a browser lets a page write the
   * clipboard or open a tab only straight from a click. Squint's message is
   * posted meanwhile; the confirmation shows once both have answered.
   */
  const send = () => {
    if (busy.current || lists.status !== "ready" || !workspaceId) return;
    const channel = pickedChannel();
    if (!channel) return;
    busy.current = true;
    const send = ++sends.current;
    const people = lists.people;
    const link = new URL(projectHref(projectId), window.location.origin).href;
    const copy = copyText(link);
    openChannel(channel);
    const message = { ...draft };
    posted.current = message;
    setSending(true);
    void Promise.allSettled([copy, post(channel, message)]).then(([copied, answered]) => {
      if (send !== sends.current) return;
      busy.current = false;
      setSending(false);
      // Null: the window turned into the way to settings.
      if (answered.status === "fulfilled" && answered.value === null) return;
      const failed: ClickUpPost = {
        status: "failed",
        message: clickUpSendErrorMessage("failed"),
        next: "again",
      };
      setSent({
        channel,
        link,
        copied: copied.status === "fulfilled",
        assignee: people.find(({ id }) => id === message.assignee)?.username ?? null,
        post: answered.status === "fulfilled" ? (answered.value ?? failed) : failed,
      });
    });
  };

  /** Copy link again: true once the clipboard took it. */
  const copyAgain = async (): Promise<boolean> => {
    if (!sent) return false;
    const copied = await copyText(sent.link).then(
      () => true,
      () => false,
    );
    setSent((current) => (current ? { ...current, copied } : current));
    return copied;
  };

  /** Open ClickUp again: the channel's tab, for one the browser held back or that was closed. */
  const openAgain = () => {
    if (sent) openChannel(sent.channel);
  };

  /** Try again: posts the same message once more, the link and the tab left as they are. */
  const postAgain = async () => {
    if (!sent || reposting.current) return;
    reposting.current = true;
    const send = sends.current;
    const { channel } = sent;
    setSent((current) => (current ? { ...current, post: { status: "posting" } } : current));
    const answered = await post(channel, posted.current);
    reposting.current = false;
    if (answered && send === sends.current) {
      setSent((current) => (current ? { ...current, post: answered } : current));
    }
  };

  /** Back from the confirmation to the form, to pick another channel. */
  const pickAnother = () => setSent(null);

  return {
    lists,
    draft,
    update,
    sending,
    sent,
    channelError,
    refreshing,
    repick,
    start,
    retry: load,
    send,
    copyAgain,
    openAgain,
    postAgain,
    pickAnother,
  };
}
