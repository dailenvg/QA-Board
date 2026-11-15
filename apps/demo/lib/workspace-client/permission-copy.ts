import { isSwitchPermission, type Permission, type SwitchPermission } from "../auth/permissions";

/**
 * What the browser says when the server refused something for a permission
 * the member doesn't have (403 `not-allowed` or `owner-only`): usually a
 * switch the owner turned off after the page loaded. Each line names who to
 * ask, from the workspace data (`ownerName`).
 */

/** Who to name in a refusal: the owner, and the workspace it's about. */
export interface AskContext {
  ownerName: string | null;
  workspaceName: string;
}

/** The owner by name, or "the workspace's owner" until they give one. */
export function ownerLabel(ownerName: string | null): string {
  return ownerName?.trim() || "the workspace's owner";
}

/** The switch-backed permission a 403 `not-allowed` body names; null for any other answer. */
export function notAllowedPermission(status: number, body: unknown): SwitchPermission | null {
  if (status !== 403 || typeof body !== "object" || body === null) return null;
  const { error, permission } = body as { error?: unknown; permission?: unknown };
  return error === "not-allowed" &&
    typeof permission === "string" &&
    isSwitchPermission(permission as Permission)
    ? (permission as SwitchPermission)
    : null;
}

/** The line for a switch turned off after the page loaded, where the refused action was. */
export function notAllowedMessage(permission: SwitchPermission, context: AskContext): string {
  const owner = ownerLabel(context.ownerName);
  switch (permission) {
    case "members.manage":
      return `You can no longer invite or remove people in ${context.workspaceName}. Ask ${owner} if you need to.`;
    case "links.manage":
      return `You can no longer change this link. Ask ${owner} if you need to.`;
    case "projects.trash":
      return `You can no longer move projects to trash or restore them. Ask ${owner} if you need to.`;
    case "workspace.import":
      return `You can no longer import local data into ${context.workspaceName}. Ask ${owner} if you need to.`;
  }
}

/** Undo of a trashed project, refused because the trash switch went off meanwhile. */
export function restoreRefusedMessage(projectName: string): string {
  return `Couldn't bring back ${projectName}, because you can no longer restore projects.`;
}

/** Undo of a client's deleted comment, once its review link no longer has it. */
export const CLIENT_COMMENT_GONE =
  "Couldn't bring the comment back, because it's no longer on the review link.";
