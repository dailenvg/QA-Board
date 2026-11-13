import type { ApiResult } from "./api";
import { retryAfterSeconds } from "./unlock";

/**
 * Emailing a review link's invitation from the Share window
 * (`POST .../share-link/invites`): what the server's answer means, and what
 * the window says about it.
 */

/** The server's answer to a send. */
export interface InvitesSent {
  sent: number;
  invitedCount: number;
}

export type InviteResult =
  | ({ ok: true } & InvitesSent)
  /** Some addresses can't take it: not addresses, or (on a preview) not the workspace's members. */
  | { ok: false; reason: "invalid-addresses" | "members-only"; addresses: string[] }
  /** Over the hour's limit: nothing went, and nothing can until `retryAt` (epoch ms). */
  | { ok: false; reason: "rate-limited"; retryAt: number }
  /** The review window closed: a longer one in Settings opens it again. */
  | { ok: false; reason: "review-closed" }
  /** This site has no email settings (a preview, usually): nothing went, and retrying won't help. */
  | { ok: false; reason: "email-off" }
  /** The link doesn't open: revoked or gone (`gone`), or its project archived (`closed`). */
  | { ok: false; reason: "gone" | "closed" }
  /** No answer, or Resend refused: nothing went, and trying again may work. */
  | { ok: false; reason: "failed" };

function addressesOf(body: unknown): string[] {
  const addresses = (body as { addresses?: unknown } | null)?.addresses;
  return Array.isArray(addresses)
    ? addresses.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * What a send's answer means. `retryAfter` is the 429's `Retry-After`
 * header, when the caller has it; the body's `retryAfterSeconds` stands in.
 */
export function inviteResult(
  answer: ApiResult<InvitesSent>,
  now: number,
  retryAfter: string | null = null,
): InviteResult {
  if (answer.ok) return { ok: true, ...answer.value };
  switch (answer.error) {
    case "invalid-addresses":
    case "members-only":
      return { ok: false, reason: answer.error, addresses: addressesOf(answer.body) };
    case "rate-limited":
      return {
        ok: false,
        reason: "rate-limited",
        retryAt: now + retryAfterSeconds(retryAfter, answer.body, now) * 1000,
      };
    case "review-closed":
      return { ok: false, reason: "review-closed" };
    case "link-closed":
      return { ok: false, reason: "closed" };
    case "email-off":
      return { ok: false, reason: "email-off" };
    default:
      return answer.status === 404
        ? { ok: false, reason: "gone" }
        : { ok: false, reason: "failed" };
  }
}

const people = (count: number) => `${count} ${count === 1 ? "person" : "people"}`;

/** The toast after a send. */
export function sentMessage(sent: number): string {
  return `${sent === 1 ? "Invite" : "Invites"} sent to ${people(sent)}.`;
}

/** The line beside Send: how many different people the link's invitations have reached. */
export function sentToLine(invitedCount: number): string {
  return invitedCount ? `Sent to ${people(invitedCount)} so far` : "No invites sent yet";
}

/** The Send button's words. */
export function sendLabel(count: number, sending: boolean): string {
  if (sending) return "Sending…";
  if (count === 0) return "Send invites";
  return count === 1 ? "Send 1 invite" : `Send ${count} invites`;
}

/** "12 minutes": a wait, in whole minutes, never "0". */
export function minutesLeft(secondsLeft: number): string {
  const minutes = Math.max(1, Math.ceil(secondsLeft / 60));
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/** Why a send didn't go, and what to do; the addresses' own reasons go on their chips. */
export function inviteError(
  result: Exclude<InviteResult, { ok: true }>,
  secondsLeft: number,
): string {
  switch (result.reason) {
    case "invalid-addresses":
      return "Some of these aren't email addresses. Remove the marked ones, type them again, then send.";
    case "members-only":
      return "This preview site only emails people in your workspace. Remove the marked addresses, or send from the live site.";
    case "rate-limited":
      return `You've sent a lot of invites this hour. Try again in ${minutesLeft(secondsLeft)}.`;
    case "review-closed":
      return "The review window has closed, so clients can't comment. Choose a longer window or No limit in Settings, then send again.";
    case "closed":
      return "This project is archived, so its link doesn't open. Unarchive it to send invites.";
    case "gone":
      return "This link no longer works. Close this window and create a new link.";
    case "email-off":
      return "Email isn't set up on this site, so nothing was sent. Use Copy link or Messages instead.";
    case "failed":
      return "The invites didn't go out. Check your connection and try again.";
  }
}
