/**
 * The browser side of the Members routes: removing someone and setting a
 * member's switches, and what each answer means on the Members page (4b.0).
 * Never throws: a network failure is an outcome too.
 */

import { knownSwitches, type MemberSwitch } from "../auth/permissions";
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
  | "signed-out"
  /** The request never reached Squint. */
  | "offline"
  /** Squint answered, but with an error of its own. */
  | "failed";

export type MembersOutcome<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: MembersError };

async function send(method: "PATCH" | "DELETE", path: string, body: unknown) {
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

type Body = { error?: unknown; protected?: unknown; permissions?: unknown } | null;

async function readBody(response: Response): Promise<Body> {
  const body: unknown = await response.json().catch(() => null);
  return body && typeof body === "object" ? body : null;
}

function errorOf(status: number, body: Body): MembersError {
  if (status === 401) return "signed-out";
  if (status === 404) return "gone";
  if (status === 409 && body?.error === "leaving") return "leaving";
  if (status === 403 && body?.error === "owner-only") return "owner-only";
  if (status === 403 && body?.error === "not-allowed") {
    return body.protected === true ? "protected" : "not-allowed";
  }
  return "failed";
}

const memberPath = (userId: string) => `/api/account/members/${encodeURIComponent(userId)}`;

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

/** What the refusal is about: changing someone's switches, or removing them; and who, by name. */
export interface MembersAction {
  kind: "switches" | "remove";
  name: string;
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
): string {
  const owner = ownerLabel(context.ownerName);
  const workspace = context.workspaceName;
  const { name } = action;
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
