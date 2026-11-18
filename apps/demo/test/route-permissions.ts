import type { Permission } from "@/lib/auth/permissions";

/**
 * Who may call each API route, method by method: the classification every
 * route must have before it ships (`route-permissions.test.ts` fails on any
 * route file or method missing here). Paths are the route's folder below
 * `app`, with `[name]` segments as `:name`.
 *
 * - `permission`: a workspace route, checked with `can` (`withMember`,
 *   `withOwnWorkspace`): the owner always, a member per section 3's matrix.
 * - `self`: acts on the session's own account only.
 * - `owner-key+member`: a share's owner routes (`asOwner`): the owner key,
 *   and for a workspace's share the session's membership of it, with
 *   `permission` too where it names one.
 * - `signed-in`: any session, no workspace.
 * - `guest`: a review link's token (`asClient`).
 * - `public`: anyone (each route checks its own token or limit, if any).
 * - `cron-secret`: the cron's bearer secret.
 * - `admin`: the Squint admin only (`withAdminWorkspace`): 401 signed out,
 *   404 for anyone else (`workspace-routes.test.ts`).
 */
export type RouteAccess =
  | { kind: "permission"; permission: Permission }
  | { kind: "owner-key+member"; permission?: Permission }
  | { kind: "self" | "signed-in" | "guest" | "public" | "cron-secret" | "admin" };

const may = (permission: Permission): RouteAccess => ({ kind: "permission", permission });
const READ = may("workspace.read");
const WRITE = may("workspace.write");
const SELF: RouteAccess = { kind: "self" };
const SIGNED_IN: RouteAccess = { kind: "signed-in" };
const GUEST: RouteAccess = { kind: "guest" };
const PUBLIC: RouteAccess = { kind: "public" };
const OWNER_KEY: RouteAccess = { kind: "owner-key+member" };
const ADMIN: RouteAccess = { kind: "admin" };

export const ROUTE_PERMISSIONS: Record<string, Record<string, RouteAccess>> = {
  // The workspace (`withMember`).
  "/api/w/:workspaceId/author": { GET: READ, PUT: WRITE },
  "/api/w/:workspaceId/snapshot": { GET: READ },
  "/api/w/:workspaceId/folders": { GET: READ, POST: WRITE },
  "/api/w/:workspaceId/folders/:folderId": { PATCH: WRITE, DELETE: WRITE },
  "/api/w/:workspaceId/import": { POST: may("workspace.import") },
  "/api/w/:workspaceId/projects": { GET: READ, POST: WRITE },
  "/api/w/:workspaceId/projects/:projectId": {
    GET: READ,
    PATCH: WRITE,
    DELETE: may("projects.trash"),
  },
  "/api/w/:workspaceId/projects/:projectId/restore": { POST: may("projects.trash") },
  // Undoing a page project whose upload failed: only a new one with nothing in it, so no switch.
  "/api/w/:workspaceId/projects/:projectId/abandon": { POST: WRITE },
  "/api/w/:workspaceId/projects/:projectId/archive": { PUT: WRITE },
  "/api/w/:workspaceId/projects/:projectId/label": { PUT: WRITE },
  "/api/w/:workspaceId/projects/:projectId/pages": { GET: READ, PUT: WRITE },
  "/api/w/:workspaceId/projects/:projectId/snapshots": { GET: READ, POST: WRITE },
  "/api/w/:workspaceId/projects/:projectId/snapshots/:snapshotId": { DELETE: WRITE },
  "/api/w/:workspaceId/projects/:projectId/blobs/:key": { GET: READ, PUT: WRITE, DELETE: WRITE },
  // Text, crop and delete are row checks inside (decision 6): the route lets every member in.
  "/api/w/:workspaceId/projects/:projectId/comments": { GET: READ, POST: WRITE },
  "/api/w/:workspaceId/projects/:projectId/comments/:commentId": { PATCH: WRITE, DELETE: WRITE },
  // A client's edit, copied from the review link (4.12): sync, like the pull that finds it.
  "/api/w/:workspaceId/projects/:projectId/comments/:commentId/client-edit": { POST: WRITE },
  // Reading the link (every member's viewer syncs it) and the pull position are sync, not managing it.
  "/api/w/:workspaceId/projects/:projectId/share-link": {
    GET: READ,
    PATCH: WRITE,
    PUT: may("links.manage"),
    DELETE: may("links.manage"),
  },
  "/api/w/:workspaceId/projects/:projectId/share-link/settings": { PATCH: may("links.manage") },
  "/api/w/:workspaceId/projects/:projectId/share-link/password": {
    PUT: may("links.manage"),
    DELETE: may("links.manage"),
  },
  "/api/w/:workspaceId/projects/:projectId/share-link/invites": { POST: may("links.manage") },
  // The member's own ClickUp connection (040).
  "/api/w/:workspaceId/projects/:projectId/clickup": { POST: WRITE },
  "/api/w/:workspaceId/clickup/channels": { GET: READ },
  "/api/w/:workspaceId/clickup/people": { GET: READ },
  // The Blob store's callback has no session; a member's token request goes through `withMember`.
  "/api/w/:workspaceId/blobs/token": { POST: WRITE },
  "/api/w/:workspaceId/blobs/commit": { POST: WRITE },
  // A member's avatar, by their key in this workspace (Members, from PR 5 comments too).
  "/api/w/:workspaceId/people/:personKey/avatar": { GET: READ },

  // The session's workspace (`withOwnWorkspace`).
  "/api/account/workspace": { PATCH: may("workspace.manage") },
  "/api/account/workspace/logo": {
    GET: READ,
    PUT: may("workspace.manage"),
    DELETE: may("workspace.manage"),
  },
  // The company badge on the team's avatars in the app (4.11).
  "/api/account/workspace/icon": { GET: READ },
  "/api/account/storage": { GET: READ },
  // Invites (people switch): any invite, whoever made it (D2).
  "/api/account/members/invites": { POST: may("members.manage") },
  "/api/account/members/invites/:inviteId": { DELETE: may("members.manage") },
  "/api/account/members/invites/:inviteId/resend": { POST: may("members.manage") },
  // Removing a member (people switch; never the owner, themself or another manager, D1).
  "/api/account/members/:userId": { DELETE: may("members.manage") },
  // A member's switches: the owner's alone.
  "/api/account/members/:userId/permissions": { PATCH: may("members.permissions") },

  // The session's own account.
  "/api/account": { DELETE: SELF },
  "/api/account/profile": { PATCH: SELF },
  "/api/account/password": { POST: SELF },
  "/api/account/email": { POST: SELF },
  "/api/account/sessions": { DELETE: SELF },
  "/api/account/avatar": { GET: SELF, PUT: SELF, DELETE: SELF },
  "/api/account/integrations/clickup": { POST: SELF, DELETE: SELF },

  // The admin panel's workspace actions.
  "/api/admin/workspaces/:id/quota": { PUT: ADMIN },
  "/api/admin/workspaces/:id/reset-link": { POST: ADMIN },
  "/api/admin/workspaces/:id/suspension": { PUT: ADMIN, DELETE: ADMIN },
  "/api/admin/workspaces/:id/archive": { PUT: ADMIN, DELETE: ADMIN },

  // A share's owner (A5). Revoking a workspace's link also needs the review-links switch.
  "/api/shares": { POST: SIGNED_IN },
  "/api/shares/:shareId": {
    PATCH: OWNER_KEY,
    DELETE: { kind: "owner-key+member", permission: "links.manage" },
  },
  "/api/shares/:shareId/changes": { GET: OWNER_KEY },
  "/api/shares/:shareId/manifest": { GET: OWNER_KEY },
  "/api/shares/:shareId/blobs/:key": { PUT: OWNER_KEY, GET: OWNER_KEY },

  // A review link's guests.
  "/api/s/:token": { GET: GUEST },
  "/api/s/:token/unlock": { POST: GUEST },
  "/api/s/:token/comments": { POST: GUEST },
  // A client's edit of their own comment: the token, and the comment's edit key (4.12).
  "/api/s/:token/comments/:commentId": { PATCH: GUEST },
  "/api/s/:token/capture": { POST: GUEST },
  "/api/s/:token/blobs/:key": { GET: GUEST },
  "/api/s/:token/brand/icon": { GET: GUEST },
  "/api/s/:token/brand/logo": { GET: GUEST },
  // A team member's avatar on the link, by their key there (4.11), behind its password.
  "/api/s/:token/people/:key/avatar": { GET: GUEST },

  // Signing in and out, and links from emails.
  "/api/auth/login": { POST: PUBLIC },
  "/api/auth/logout": { POST: PUBLIC },
  "/api/auth/reset": { POST: PUBLIC },
  "/api/auth/reset/complete": { POST: PUBLIC },
  "/api/auth/email-change/confirm": { POST: PUBLIC },
  // Accepting a workspace invite: the link's token, signed in or not.
  "/api/auth/join": { POST: PUBLIC },

  // Everything else.
  "/api/capture": { POST: SIGNED_IN },
  "/api/frame-check": { GET: PUBLIC },
  "/api/pinpoint": { GET: PUBLIC, POST: PUBLIC, PATCH: PUBLIC },
  "/api/p/:id/brand/icon": { GET: PUBLIC },
  // A workspace's company icon by its opaque key, for its invite emails (signed out).
  "/api/c/:key/brand/icon": { GET: PUBLIC },
  "/api/cron/expire": { GET: { kind: "cron-secret" } },
};

/**
 * Metadata images: not `route.ts` files, so the walk doesn't see them. GET
 * only, public, and they show company and project names only.
 */
export const PUBLIC_IMAGES: readonly string[] = [
  "app/opengraph-image.tsx",
  "app/twitter-image.tsx",
  "app/p/[id]/opengraph-image.tsx",
  "app/p/[id]/twitter-image.tsx",
  "app/s/opengraph-image.tsx",
  "app/s/twitter-image.tsx",
  "app/s/[token]/opengraph-image.tsx",
  "app/s/[token]/twitter-image.tsx",
];
