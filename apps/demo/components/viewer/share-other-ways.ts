/**
 * Sending a review link's invitation another way than email: Messages gets
 * the invitation message, Copy link the bare link. Nothing is sent by Squint,
 * so these don't count toward the email limits and aren't audited.
 */

export type OtherWay = "messages" | "link";

/** A Messages (SMS) link with the message filled in: iOS, macOS and Android open it. */
export function smsHref(message: string): string {
  return `sms:?&body=${encodeURIComponent(message)}`;
}

/** What the window says once it's copied. */
export function copiedMessage(way: OtherWay): string {
  return way === "link" ? "Link copied." : "Message copied. Paste it into Messages.";
}

/** What it says when the browser wouldn't copy. */
export function copyFailedMessage(way: OtherWay): string {
  return way === "link"
    ? "Copying was blocked. Allow this site to use the clipboard, then try again."
    : "Copying was blocked. Messages opens with the message where it can.";
}
