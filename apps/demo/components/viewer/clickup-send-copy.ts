import { accountErrorMessage } from "@/lib/account/account-client";
import { FOLLOWERS_MAX } from "@/lib/integrations/clickup/message";
import type { ClickUpSendError } from "@/lib/integrations/clickup/send-client";

/** Every line the Send to ClickUp window shows, in one place for review. */
export const CLICKUP_SEND_COPY = {
  button: "ClickUp",
  buttonLabel: "Send to ClickUp",
  title: "Send to ClickUp",
  description:
    "Post this project to a ClickUp Chat channel for your team to review. It appears under your ClickUp name.",
  notConnected: {
    title: "Plug in your ClickUp",
    body: "Add your ClickUp token once, then send projects straight to your team's channels.",
    action: "Connect ClickUp",
  },
  reconnect: {
    title: "ClickUp came unplugged",
    body: "ClickUp didn't accept your saved token. Connect again with a new one.",
    action: "Reconnect ClickUp",
  },
  unavailable:
    "Sending to ClickUp isn't available on this site right now. If your team needs it, ask your Squint admin.",
  loading: "Loading your ClickUp channels…",
  loadFailed: "Your ClickUp channels didn't load.",
  retry: "Try again",
  required: "Required",
  channel: {
    label: "Channel",
    search: "Search channels",
    empty:
      "Your ClickUp workspace has no Chat channels you can post to yet. Create one in ClickUp, then try again.",
    noMatch: (query: string) => `No channel matches “${query}”.`,
    required: "Pick a channel to send to.",
  },
  assignee: {
    label: "Assign to",
    search: "Search people",
    nobody: "Nobody",
    noMatch: (query: string) => `Nobody matches “${query}”.`,
  },
  followers: {
    label: "Followers",
    search: "Search people",
    hint: `Optional, up to ${FOLLOWERS_MAX}`,
    full: `That's ${FOLLOWERS_MAX}, the most one message can have.`,
    noMatch: (query: string) => `Nobody matches “${query}”.`,
    remove: (name: string) => `Remove ${name}`,
  },
  /** Read out as a picked person's chip is removed. */
  removed: (name: string) => `Removed ${name}.`,
  /** Read out as Enter in a search field picks its first match: "Picked #design.". */
  picked: (name: string) => `Picked ${name}.`,
  /** Read out as a search narrows a list: "3 matches". */
  matches: (count: number) => `${count} ${count === 1 ? "match" : "matches"}`,
  people: {
    empty: "Your ClickUp workspace has nobody else in it yet.",
    /** Under Assign to and Followers. */
    notified: "They're notified in ClickUp.",
  },
  optional: "Optional",
  /** "12 more. Keep typing to narrow the list." */
  more: (count: number) => `${count} more. Keep typing to narrow the list.`,
  note: {
    label: "Note",
    hint: "Plain text. Links and @mentions are sent as typed, so they won't link or notify anyone.",
    left: (count: number) => `${count} left`,
  },
  preview: {
    label: "Preview",
    assigned: (name: string) => `Assigned to ${name}`,
    followers: (count: number) => `${count} ${count === 1 ? "follower" : "followers"}`,
  },
  cancel: "Cancel",
  send: "Send",
  sending: "Sending…",
  /** "Sent to #design." */
  sent: (channel: string) => `Sent to #${channel}.`,
  open: "Open in ClickUp",
} as const;

/**
 * What the window says when a send fails, and the form stays for another try:
 * `retryAfterSeconds` for a 429, `channel` (its name) for one that can't be posted in.
 */
export function clickUpSendErrorMessage(
  error: ClickUpSendError,
  { retryAfterSeconds = 0, channel = "" }: { retryAfterSeconds?: number; channel?: string } = {},
): string {
  switch (error) {
    case "channel-gone":
      return "That channel isn't in ClickUp anymore. Pick another from the refreshed list.";
    case "channel-forbidden": {
      const where = channel ? `#${channel}` : "that channel";
      return `You can't post in ${where} in ClickUp. Pick another channel, or ask a ClickUp admin to add you.`;
    }
    case "archived":
    case "not-found":
      return "This project was archived or deleted, so it can't be sent. Reload the page to see it as it is now.";
    case "rate-limited": {
      const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
      return `Too many requests in a short time. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
    }
    case "unreachable":
      return "ClickUp didn't answer just now. Try again in a moment.";
    case "unavailable":
      return CLICKUP_SEND_COPY.unavailable;
    case "not-connected":
      return CLICKUP_SEND_COPY.notConnected.title;
    case "reconnect":
      return CLICKUP_SEND_COPY.reconnect.body;
    case "signed-out":
    case "offline":
    case "failed":
      return accountErrorMessage(error);
  }
}
