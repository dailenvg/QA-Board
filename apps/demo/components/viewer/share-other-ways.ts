/**
 * Sending a review link's invitation another way than email: Squint copies
 * the invitation message and opens the app it goes in. Nothing is sent by
 * Squint, so these don't count toward the email limits and aren't audited.
 */

export type OtherWay = "clickup" | "slack" | "messages" | "link";

/** Where Slack and ClickUp open, in a new tab, once the message is copied. */
export const APP_URLS = {
  clickup: "https://app.clickup.com",
  slack: "https://app.slack.com/client",
} as const;

/** A Messages (SMS) link with the message filled in: iOS, macOS and Android open it. */
export function smsHref(message: string): string {
  return `sms:?&body=${encodeURIComponent(message)}`;
}

const APP_NAMES: Record<Exclude<OtherWay, "link">, string> = {
  clickup: "ClickUp",
  slack: "Slack",
  messages: "Messages",
};

/** What the window says once it's copied. */
export function copiedMessage(way: OtherWay): string {
  return way === "link" ? "Link copied." : `Message copied. Paste it into ${APP_NAMES[way]}.`;
}

/** What it says when the browser wouldn't copy. */
export function copyFailedMessage(way: OtherWay): string {
  return way === "link"
    ? "Copying was blocked. Select the link below and copy it."
    : "Copying was blocked. Select the link below and send it yourself.";
}
