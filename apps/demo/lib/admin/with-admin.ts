import type { z } from "zod";
import { refuseWrite } from "../account/with-account";
import { apiAdmin } from "../auth/guards";
import { describeError } from "../auth/http";
import type { SessionUser } from "../auth/users";
import type { Database } from "../db/database";
import { json, readJson } from "../share/http";
import { param } from "../workspace/http";
import type { AdminTarget } from "./workspace-actions";
import { workspaceIdSchema } from "./workspace-schemas";

export interface AdminContext<T> {
  db: Database;
  admin: SessionUser;
  /** The request's JSON body, as the route's schema read it. */
  body: T;
  now: number;
}

export interface AdminWorkspaceContext<T> extends AdminContext<T> {
  /** The admin and the workspace in the route's path, for the actions. */
  target: AdminTarget;
}

type Params = { params: Promise<{ id: string }> };

type Gate = { ok: true; db: Database; admin: SessionUser } | { ok: false; response: Response };

/**
 * The admin (`apiAdmin`: a JSON 401 signed out, 404 for anyone else), then a
 * same-site `Origin` (403) and a JSON body (415), so a cross-site form can't
 * send one.
 */
async function adminGate(request: Request): Promise<Gate> {
  const account = await apiAdmin(request);
  if (!account.ok) return account;
  const refused = refuseWrite(request);
  if (refused) return { ok: false, response: refused };
  return { ok: true, db: account.db, admin: account.user };
}

/** A storage failure answers a JSON 500 and logs only the error's kind and code. */
async function guarded(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    console.error(`squint admin: storage failed (${describeError(error)})`);
    return json({ error: "storage" }, 500);
  }
}

/**
 * Wraps every `/api/admin/…` handler that acts on Squint as a whole (the
 * Storage page's), as `withAccount` does the account ones: `adminGate`, then
 * the body, through `schema` (400).
 */
export function withAdmin<T>(
  schema: z.ZodType<T>,
  run: (context: AdminContext<T>) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return (request) =>
    guarded(async () => {
      const gate = await adminGate(request);
      if (!gate.ok) return gate.response;
      const body = await readJson(request, schema);
      if (!body.ok) return body.response;
      return run({ db: gate.db, admin: gate.admin, body: body.value, now: Date.now() });
    });
}

/**
 * Wraps every `/api/admin/workspaces/[id]/…` handler: `adminGate`; the
 * workspace id (a UUID, else 404); the body, through `schema` (400).
 */
export function withAdminWorkspace<T>(
  schema: z.ZodType<T>,
  run: (context: AdminWorkspaceContext<T>) => Promise<Response>,
): (request: Request, context: Params) => Promise<Response> {
  return (request, { params }) =>
    guarded(async () => {
      const gate = await adminGate(request);
      if (!gate.ok) return gate.response;
      const workspaceId = param(workspaceIdSchema, (await params).id);
      if (!workspaceId) return json({ error: "not-found" }, 404);
      const body = await readJson(request, schema);
      if (!body.ok) return body.response;
      const { db, admin } = gate;
      const target = { adminId: admin.id, workspaceId };
      return run({ db, admin, target, body: body.value, now: Date.now() });
    });
}
