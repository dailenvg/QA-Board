import { ADMIN_AUDIT_HREF } from "../routes";

/** The audit log's filters, as its URL carries them. Client-safe. */
export interface AuditFilters {
  workspace?: string;
  /** A user's id, or `SQUINT_ACTOR`. */
  actor?: string;
  action?: string;
}

/** The actor filter's value for entries without a user: Squint itself (the daily cron, scripts). */
export const SQUINT_ACTOR = "squint";

/** Which way a page link goes from its cursor. */
export type AuditPageLink = { before: string } | { after: string };

/** The audit log at `filters`, on the newest page or the one `page` points to. */
export function auditHref(filters: AuditFilters, page?: AuditPageLink): string {
  const query = new URLSearchParams();
  if (filters.workspace) query.set("workspace", filters.workspace);
  if (filters.actor) query.set("actor", filters.actor);
  if (filters.action) query.set("action", filters.action);
  if (page && "before" in page) query.set("before", page.before);
  if (page && "after" in page) query.set("after", page.after);
  const search = query.toString();
  return search ? `${ADMIN_AUDIT_HREF}?${search}` : ADMIN_AUDIT_HREF;
}
