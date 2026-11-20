import { organization } from "better-auth/plugins/organization";
import { ac, ROLES } from "./access-control";

/**
 * Better Auth's organization plugin on Squint's workspaces (050): a
 * workspace is an organization, a membership a member, and the roles are
 * Squint's own (`access-control.ts`). Nothing in Squint calls its endpoints
 * yet, and no HTTP handler is mounted, so it serves no request: Squint's
 * guards read memberships themselves (`memberships.ts`, whose open-workspace
 * filter the plugin has no equivalent of) and check them with `can`. It adds
 * no hook. Invitations stay Squint's own (`workspace_invites`); the plugin's
 * invitation model is mapped onto nothing, so none of its invitation calls
 * may be used. The plugin sees a member's role only, not their switches:
 * its own permission checks are no stand-in for `can`.
 */

/** What the plugin reads of a workspace besides its own fields. */
interface WorkspaceExtras {
  seatLimit?: number;
}

/**
 * How many members a workspace may hold, for the plugin's own member
 * checks: its seat limit (043), or none for a workspace read without it.
 * Squint's own seat count, which also counts open invites and skips deleted
 * accounts, stays in `members/seats.ts`.
 */
function seatLimitOf(workspace: object): number {
  return (workspace as WorkspaceExtras).seatLimit ?? 0;
}

export function organizationPlugin() {
  return organization({
    ac,
    roles: ROLES,
    allowUserToCreateOrganization: false,
    disableOrganizationDeletion: true,
    membershipLimit: (_user, workspace) => seatLimitOf(workspace),
    teams: { enabled: false },
    schema: {
      session: { fields: { activeOrganizationId: "active_organization_id" } },
      organization: {
        modelName: "workspaces",
        fields: { logo: "logo_blob_key", createdAt: "created_at" },
        additionalFields: {
          seatLimit: { type: "number", required: false, input: false, fieldName: "seat_limit" },
        },
      },
      member: {
        modelName: "memberships",
        fields: { organizationId: "workspace_id", userId: "user_id", createdAt: "created_at" },
        additionalFields: {
          permissions: { type: "string[]", required: false, input: false },
        },
      },
    },
  });
}
