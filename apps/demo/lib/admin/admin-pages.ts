import { requireAdmin } from "../auth/guards";
import { describeError } from "../auth/http";
import { database, type Database } from "../db/database";
import type { SearchParams } from "../search-params";
import {
  loadAuditFilterOptions,
  loadAuditPage,
  parseAuditParams,
  type AuditFilterOptions,
  type AuditPage,
  type AuditParams,
} from "./audit-query";
import { loadAdminOverview, type AdminOverview } from "./overview";

/**
 * What the admin pages read on the server. Each one checks the session is the
 * admin's first (`requireAdmin`: a 404 for anyone else signed in, /login for
 * anyone signed out), whatever the layout already checked.
 */

/** An admin page's data, or unavailable when reading it failed (logged by kind only). */
export type AdminRead<T> = ({ kind: "ready" } & T) | { kind: "unavailable" };

async function readAsAdmin<T>(
  what: string,
  read: (db: Database) => Promise<T>,
): Promise<AdminRead<T>> {
  await requireAdmin();
  const pending = database();
  if (!pending) return { kind: "unavailable" };
  try {
    return { kind: "ready", ...(await read(await pending)) };
  } catch (error) {
    console.error(`squint admin: ${what} read failed (${describeError(error)})`);
    return { kind: "unavailable" };
  }
}

export type AdminOverviewPage = AdminRead<{ overview: AdminOverview }>;

export function loadAdminOverviewPage(): Promise<AdminOverviewPage> {
  return readAsAdmin("overview", async (db) => ({
    overview: await loadAdminOverview(db, Date.now()),
  }));
}

export type AuditLogPage = AdminRead<{
  params: AuditParams;
  page: AuditPage;
  options: AuditFilterOptions;
}>;

export function loadAuditLogPage(search: SearchParams): Promise<AuditLogPage> {
  const params = parseAuditParams(search);
  return readAsAdmin("audit log", async (db) => {
    const [page, options] = await Promise.all([
      loadAuditPage(db, params),
      loadAuditFilterOptions(db),
    ]);
    return { params, page, options };
  });
}
