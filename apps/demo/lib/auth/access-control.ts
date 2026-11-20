import { createAccessControl, type RoleAuthorizeRequest } from "better-auth/plugins/access";

/**
 * Who may do what in a workspace, as Better Auth's access control: one role
 * per membership role, and one per switch the owner turns on for a member
 * (migration 041). A member holds their role and every switch that's on, and
 * may do what any of them allows. Pure (no server import), so the browser
 * bundle can import it with `permissions.ts`; the organization plugin is
 * handed the same roles (`better-auth.ts`).
 */

/** Every action in a workspace, by resource. */
export const STATEMENT = {
  workspace: ["read", "write", "manage"],
  links: ["manage"],
  projects: ["trash"],
  import: ["run"],
  members: ["manage", "permissions"],
  comment: ["moderate"],
} as const;

export const ac = createAccessControl(STATEMENT);

/** What one action asks of the roles: one resource and its action. */
export type AccessRequest = RoleAuthorizeRequest<typeof STATEMENT>;

/**
 * The roles: the owner may do everything; a member may read and write the
 * workspace; each switch allows its one action.
 */
export const ROLES = {
  owner: ac.newRole(STATEMENT),
  member: ac.newRole({ workspace: ["read", "write"] }),
  review_links: ac.newRole({ links: ["manage"] }),
  trash: ac.newRole({ projects: ["trash"] }),
  import: ac.newRole({ import: ["run"] }),
  people: ac.newRole({ members: ["manage"] }),
};

export type AccessRole = keyof typeof ROLES;

/** Whether any of `roles` allows `request`, as the organization plugin checks a role list. */
export function authorize(roles: readonly AccessRole[], request: AccessRequest): boolean {
  return roles.some((role) => ROLES[role].authorize(request).success);
}
