/**
 * The browser side of the Members routes: inviting people, resending and
 * cancelling invites, removing someone and setting a member's switches, and
 * what each answer means on the Members page (4b.0). Never throws: a network
 * failure is an outcome too.
 */

import { knownSwitches, type MemberSwitch } from "../auth/permissions";
import type { InviteResult } from "../workspace/members/create-invites";
import type { Seats } from "../workspace/members/seats";
import {
  notAllowedMessage,
  ownerLabel,
  type AskContext,
} from "../workspace-client/permission-copy";
import { accountErrorMessage } from "./account-client";

export type MembersError =
  /** Only the owner may do it (switches), or the person is the owner (removal). */
  | "owner-only"
  /** The people switch was turned off after the page loaded. */
  | "not-allowed"
  /** Not this person (D1): they're a manager now, or it's the caller themself. */
  | "protected"
  /** Not in the workspace any more: already removed. */
  | "gone"
  /** They deleted their own account meanwhile, so they're already leaving. */
  | "leaving"
  /** An invite accepted, cancelled or renewed elsewhere since the page loaded. */
  | "changed"
  /** Not enough seats left for what was asked. */
  | "seats-full"
  /** Over the day's invite emails. */
  | "rate-limited"
  /** This invite's email went out less than a minute ago. */
  | "cooldown"
  | "signed-out"
  /** The request never reached Squint. */
  | "offline"
  /** Squint answered, but with an error of its own. */
  | "failed";

/** What a refusal says beyond its code: the seats now, or how long to wait and why. */
export interface MembersRefusalDetail {
  seats?: Seats;
  retryAfterSeconds?: number;
  /** For `rate-limited`: how many invite emails went out in the last 24 hours. */
  sentInWindow?: number;
}

export type MembersOutcome<T extends object = object> =
  ({ ok: true } & T) | ({ ok: false; error: MembersError } & MembersRefusalDetail);

async function send(method: "POST" | "PATCH" | "DELETE", path: string, body: unknown) {
  try {
    return await fetch(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

type Body = {
  error?: unknown;
  protected?: unknown;
  permissions?: unknown;
  used?: unknown;
  limit?: unknown;
  retryAfterSeconds?: unknown;
  sentInWindow?: unknown;
} | null;

async function readBody(response: Response): Promise<Body> {
  const body: unknown = await response.json().catch(() => null);
  return body && typeof body === "object" ? body : null;
}

const count = (value: unknown) => (typeof value === "number" && value >= 0 ? value : 0);

function errorOf(status: number, body: Body): MembersError {
  if (status === 401) return "signed-out";
  if (status === 409 && body?.error === "seats-full") return "seats-full";
  if (status === 429) return body?.error === "cooldown" ? "cooldown" : "rate-limited";
  if (status === 404) return "gone";
  if (status === 409 && body?.error === "leaving") return "leaving";
  if (status === 403 && body?.error === "owner-only") return "owner-only";
  if (status === 403 && body?.error === "not-allowed") {
    return body.protected === true ? "protected" : "not-allowed";
  }
  return "failed";
}

/** A refusal with what its body says: the seats now, or the wait. */
function refusal(
  status: number,
  body: Body,
): { ok: false; error: MembersError } & MembersRefusalDetail {
  const error = errorOf(status, body);
  if (error === "seats-full") {
    return { ok: false, error, seats: { used: count(body?.used), limit: count(body?.limit) } };
  }
  if (error === "rate-limited" || error === "cooldown") {
    return {
      ok: false,
      error,
      retryAfterSeconds: count(body?.retryAfterSeconds) || 60,
      ...(error === "rate-limited" ? { sentInWindow: count(body?.sentInWindow) } : {}),
    };
  }
  return { ok: false, error };
}

const memberPath = (userId: string) => `/api/account/members/${encodeURIComponent(userId)}`;
const invitePath = (inviteId: string) =>
  `/api/account/members/invites/${encodeURIComponent(inviteId)}`;

/**
 * Invites `emails` (as typed) in one request: each address's result, in
 * order, and the seats now; or why nothing was sent (4.1).
 */
export async function inviteMembers(
  emails: readonly string[],
): Promise<MembersOutcome<{ results: InviteResult[]; seats: Seats }>> {
  const response = await send("POST", "/api/account/members/invites", { emails });
  if (!response) return { ok: false, error: "offline" };
  const body = await readBody(response);
  // The workspace closed meanwhile: nothing to say about anyone in it.
  if (response.status === 404) return { ok: false, error: "failed" };
  if (!response.ok) return refusal(response.status, body);
  const answer = body as { results?: unknown; seats?: Seats } | null;
  if (!Array.isArray(answer?.results) || !answer.seats) return { ok: false, error: "failed" };
  return { ok: true, results: answer.results as InviteResult[], seats: answer.seats };
}

/**
 * Sends an invite again (or, with email off, renews it): whether the email
 * went out, and when its link now stops working. A 404 or 409 means it changed
 * elsewhere.
 */
export async function resendMemberInvite(
  inviteId: string,
): Promise<MembersOutcome<{ emailed: boolean; expiresAt: number }>> {
  const response = await send("POST", `${invitePath(inviteId)}/resend`, {});
  if (!response) return { ok: false, error: "offline" };
  const body = await readBody(response);
  if (response.status === 404) return { ok: false, error: "changed" };
  if (!response.ok) return refusal(response.status, body);
  const answer = body as { emailed?: unknown; expiresAt?: unknown } | null;
  return { ok: true, emailed: answer?.emailed === true, expiresAt: count(answer?.expiresAt) };
}

/** Cancels an invite: its link stops working and its seat is free. */
export async function cancelMemberInvite(inviteId: string): Promise<MembersOutcome> {
  const response = await send("DELETE", invitePath(inviteId), {});
  if (!response) return { ok: false, error: "offline" };
  if (response.ok) return { ok: true };
  if (response.status === 404 || response.status === 409) return { ok: false, error: "changed" };
  return refusal(response.status, await readBody(response));
}

/** Removes `userId` from the workspace: they're signed out at once, their account goes in 24 hours. */
export async function removeMember(userId: string): Promise<MembersOutcome> {
  const response = await send("DELETE", memberPath(userId), {});
  if (!response) return { ok: false, error: "offline" };
  if (response.ok) return { ok: true };
  return { ok: false, error: errorOf(response.status, await readBody(response)) };
}

/** Sets all four of a member's switches (the owner's alone); answers the ones now on. */
export async function saveMemberSwitches(
  userId: string,
  switches: readonly MemberSwitch[],
): Promise<MembersOutcome<{ permissions: MemberSwitch[] }>> {
  const on = (value: MemberSwitch) => switches.includes(value);
  const response = await send("PATCH", `${memberPath(userId)}/permissions`, {
    reviewLinks: on("review_links"),
    trash: on("trash"),
    import: on("import"),
    people: on("people"),
  });
  if (!response) return { ok: false, error: "offline" };
  const body = await readBody(response);
  if (!response.ok) return { ok: false, error: errorOf(response.status, body) };
  const permissions = Array.isArray(body?.permissions) ? (body.permissions as string[]) : [];
  return { ok: true, permissions: knownSwitches(permissions) };
}

/**
 * What the refusal is about: changing someone's switches or removing them
 * (who, by name); sending invites (how many addresses); or one invite's row.
 */
export type MembersAction =
  | { kind: "switches" | "remove"; name: string }
  | { kind: "invite"; addresses: number }
  | { kind: "resend" | "cancel"; email: string };

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "12 minutes", or past an hour "3 hours": a wait, rounded up, never "0". */
export function waitLabel(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return plural(minutes, "minute", "minutes");
  return plural(Math.ceil(minutes / 60), "hour", "hours");
}

/** The day's invite emails are used up (4b.2): how many went out, and when more can. */
export function emailLimitMessage(sentInWindow: number, retryAfterSeconds: number): string {
  return `You've sent ${plural(sentInWindow, "invite", "invites")} in the last 24 hours. Try again in ${waitLabel(retryAfterSeconds)}.`;
}

/**
 * Nothing was sent: fewer seats are left than addresses (4b.2). How many are
 * left now, and how many addresses to take out.
 */
export function seatsFullMessage(left: number, addresses: number): string {
  const over = Math.max(1, addresses - left);
  const now = left === 1 ? "Only 1 seat is left now." : `Only ${left} seats are left now.`;
  return `Nothing was sent. ${now} Remove ${plural(over, "address", "addresses")}, then send again.`;
}

/** The person a refusal names: theirs, or the invite's address. */
function subject(action: MembersAction): string {
  return "name" in action ? action.name : "email" in action ? action.email : "";
}

/**
 * What the Members page says for a refused or failed action (4b.0, 4b.2,
 * 4b.5): the owner and workspace by name from the page data, and the person
 * by name for a removal. Already removed and already leaving aren't failures:
 * they say the list is up to date now.
 */
export function membersErrorMessage(
  error: MembersError,
  action: MembersAction,
  context: AskContext,
  detail: MembersRefusalDetail = {},
): string {
  const owner = ownerLabel(context.ownerName);
  const workspace = context.workspaceName;
  const name = subject(action);
  switch (error) {
    case "owner-only":
      return action.kind === "switches"
        ? `Only ${owner} can change what people in ${workspace} can do.`
        : context.ownerName?.trim()
          ? `${owner} owns ${workspace}, so nobody can remove them.`
          : `Nobody can remove the owner of ${workspace}.`;
    case "not-allowed":
      return notAllowedMessage("members.manage", context);
    case "protected":
      return `Only ${owner} can remove ${name}.`;
    case "gone":
      return `${name} was already removed from ${workspace}. The list is up to date now.`;
    case "leaving":
      return `${name} deleted their own account, so they're already leaving ${workspace}. The list is up to date now.`;
    case "changed":
      return "That invite has changed. The list is up to date now.";
    case "seats-full": {
      if (action.kind !== "invite") {
        return "No seat is free, so this invite can't be renewed. Cancel another invite or remove someone, then try again.";
      }
      const seats = detail.seats ?? { used: 0, limit: 0 };
      return seatsFullMessage(Math.max(0, seats.limit - seats.used), action.addresses);
    }
    case "rate-limited":
      return emailLimitMessage(detail.sentInWindow ?? 0, detail.retryAfterSeconds ?? 0);
    case "cooldown":
      return `The email to ${name} went out less than a minute ago. Try again in a moment.`;
    case "offline":
      return action.kind === "switches"
        ? "Couldn't save this change. Check your connection and try again."
        : accountErrorMessage("offline");
    case "failed":
      return action.kind === "switches"
        ? "Couldn't save this change. Try again in a moment."
        : accountErrorMessage("failed");
    case "signed-out":
      return accountErrorMessage("signed-out");
  }
}
