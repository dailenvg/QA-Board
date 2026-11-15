import type { MembershipRole } from "./memberships";

/**
 * What a member may do in their workspace: one guard for the server (route
 * wrappers) and the browser (which hides what the server would refuse), so
 * the two never drift. Pure, so the browser bundle can import it.
 */

/** The owner's switches for one member (migration 041's values). */
export type MemberSwitch = "review_links" | "trash" | "import" | "people";

export const MEMBER_SWITCHES: readonly MemberSwitch[] = [
  "review_links",
  "trash",
  "import",
  "people",
];

/** What a new member gets, and every member had when 041 ran: all but `people`. */
export const DEFAULT_SWITCHES: readonly MemberSwitch[] = ["review_links", "trash", "import"];

/** Every member, whatever their switches. */
type MemberPermission = "workspace.read" | "workspace.write";
/** A member with the matching switch on (`SWITCH_FOR`), and the owner. */
export type SwitchPermission =
  "links.manage" | "projects.trash" | "workspace.import" | "members.manage";
/** The owner alone. */
type OwnerPermission = "workspace.manage" | "members.permissions" | "comment.moderate";

export type Permission = MemberPermission | SwitchPermission | OwnerPermission;

export const SWITCH_FOR: Readonly<Record<SwitchPermission, MemberSwitch>> = {
  "links.manage": "review_links",
  "projects.trash": "trash",
  "workspace.import": "import",
  "members.manage": "people",
};

const OWNER_ONLY: ReadonlySet<Permission> = new Set([
  "workspace.manage",
  "members.permissions",
  "comment.moderate",
]);

/** What `can` reads: a membership's role and switches. */
export interface Access {
  role: MembershipRole;
  permissions: readonly MemberSwitch[];
}

export function isSwitchPermission(permission: Permission): permission is SwitchPermission {
  return permission in SWITCH_FOR;
}

export function isOwnerOnly(permission: Permission): boolean {
  return OWNER_ONLY.has(permission);
}

/**
 * Whether `access` allows `permission`. The owner may do everything. A member
 * may read and write the workspace, and do what each switch that's on allows;
 * never what only the owner may.
 */
export function can(access: Access, permission: Permission): boolean {
  if (access.role === "owner") return true;
  if (isOwnerOnly(permission)) return false;
  if (isSwitchPermission(permission)) return access.permissions.includes(SWITCH_FOR[permission]);
  return true;
}

/** What a route needs unless it names more: reading on a GET or HEAD, writing otherwise. */
export function defaultPermission(method: string): Permission {
  return method === "GET" || method === "HEAD" ? "workspace.read" : "workspace.write";
}

/** Only the switches 041 knows, in its order: anything else from a row is dropped. */
export function knownSwitches(values: readonly string[] | null | undefined): MemberSwitch[] {
  const given = new Set(values ?? []);
  return MEMBER_SWITCHES.filter((value) => given.has(value));
}

/**
 * The refusal for a permission `access` lacks: 403 `owner-only` for what only
 * the owner may do, 403 `not-allowed` naming the permission for a switch
 * that's off, so the browser can say which. Null when it's allowed.
 */
export function refusalFor(access: Access, permission: Permission): Response | null {
  if (can(access, permission)) return null;
  const body = isOwnerOnly(permission)
    ? { error: "owner-only" }
    : { error: "not-allowed", permission };
  return Response.json(body, { status: 403, headers: { "cache-control": "no-store" } });
}
