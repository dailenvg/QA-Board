import { accountErrorMessage } from "@/lib/account/account-client";
import type { ClickUpSendError } from "@/lib/integrations/clickup/send-client";

/** Every line the Send to ClickUp window shows, in one place for review. */
export const CLICKUP_SEND_COPY = {
  button: "ClickUp",
  buttonLabel: "Send to ClickUp",
  title: "Send to ClickUp",
  description:
    "Squint posts your note and assigns the reviewer. Then you paste the link in the channel, so ClickUp shows the branded card.",
  /** Each step's title, numbered as the Share window's are. */
  steps: {
    channel: "Where should it go?",
    assignee: "Who reviews it?",
    note: "Add a note",
  },
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
  /** Read out as Enter in a search field picks its first match: "Picked #design.". */
  picked: (name: string) => `Picked ${name}.`,
  /** Read out as a search narrows a list: "3 matches". */
  matches: (count: number) => `${count} ${count === 1 ? "match" : "matches"}`,
  people: {
    empty: "Your ClickUp workspace has nobody else in it yet.",
  },
  optional: "Optional",
  /** "12 more. Keep typing to narrow the list." */
  more: (count: number) => `${count} more. Keep typing to narrow the list.`,
  note: {
    label: "Note",
    left: (count: number) => `${count} left`,
  },
  preview: {
    label: "What happens when you send",
    /** Squint's message in the channel, as ClickUp will show it. */
    posts: "Squint posts this for you",
    /** The sender, as the preview shows them: ClickUp shows their own name. */
    sender: "You",
    /** When it's sent, as the preview shows it. */
    when: "now",
    assigned: (name: string) => `Assigned to ${name}`,
    /** The link the member pastes under it, and the card ClickUp shows for it. */
    paste: "Then you paste the link",
    card: (project: string) => `Link card: ${project}, ready for your team's review.`,
  },
  cancel: "Cancel",
  send: "Copy link & open ClickUp",
  sending: "Sending…",
  /** The window after a send: what's done, and the paste that's left. */
  done: {
    title: "One step left: paste the link",
    /** "ClickUp opened in a new tab on #design." */
    opened: (channel: string) => `ClickUp opened in a new tab on #${channel}.`,
    /** The track of steps, as read out. */
    track: "What's done, and what's left",
    /** Each step's name on the track, and the word under it. */
    steps: {
      posted: "Message posted",
      posting: "Posting…",
      notPosted: "Not posted",
      copied: "Link copied",
      notCopied: "Not copied",
      clipboard: "To your clipboard",
      copyBelow: "Copy it below",
      paste: "Paste it",
      inClickUp: "In ClickUp",
    },
    /** Under the track when someone was assigned. */
    assigned: (name: string) => `${name} is assigned and gets a ClickUp notification.`,
    /** Read out while Try again posts the message once more. */
    posting: (channel: string) => `Posting the message in #${channel}…`,
    notPosted: "The message wasn't posted",
    postAgain: "Try again",
    pickAnother: "Pick another channel",
    notCopied: "Copy the link to paste it",
    linkLabel: "Project link",
    /** "Paste it in #design and press Enter" */
    paste: (channel: string) => `Paste it in #${channel} and press Enter`,
    /** Touch screens: no keys to press. */
    pasteTouch: "Press and hold in the message box, tap Paste, then send.",
    then: "then",
    enter: "Enter",
    /** The card the paste turns into. */
    cardAlt: (project: string) => `Link card: ${project}, ready for your team's review.`,
    card: "ClickUp builds the branded card as soon as the link is pasted.",
    copyAgain: "Copy link again",
    /** Copy link again, for a moment after it worked. */
    copiedAgain: "Link copied",
    openAgain: "Open ClickUp again",
    close: "Done",
  },
} as const;

/**
 * What the window says when a send fails: `retryAfterSeconds` for a 429,
 * `channel` (its name) for one that can't be posted in, `said` for what
 * ClickUp said of a refusal Squint doesn't tell apart.
 */
export function clickUpSendErrorMessage(
  error: ClickUpSendError,
  {
    retryAfterSeconds = 0,
    channel = "",
    said,
  }: { retryAfterSeconds?: number; channel?: string; said?: string } = {},
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
      return said
        ? `ClickUp didn't take the message. It said: “${said}”`
        : "ClickUp didn't answer just now. Try again in a moment.";
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
