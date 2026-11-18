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

export interface AdminWorkspaceContext<T> {
  db: Database;
  admin: SessionUser;
  /** The admin and the workspace in the route's path, for the actions. */
  target: AdminTarget;
  /** The request's JSON body, as the route's schema read it. */
  body: T;
  now: number;
}

type Params = { params: Promise<{ id: string }> };

type Handler<T> = (context: AdminWorkspaceContext<T>) => Promise<Response>;

/**
 * Wraps every `/api/admin/workspaces/[id]/…` handler, as `withAccount` does
 * the account ones. In order: the admin (`apiAdmin`: a JSON 401 signed out,
 * 404 for anyone else); a same-site `Origin` (403) and a JSON body (415), so
 * a cross-site form can't send one; the workspace id (a UUID, else 404); the
 * body, through `schema` (400). A storage failure answers a JSON 500 and logs
 * only the error's kind and code.
 */
export function withAdminWorkspace<T>(
  schema: z.ZodType<T>,
  run: Handler<T>,
): (request: Request, context: Params) => Promise<Response> {
  return async (request, { params }) => {
    try {
      const account = await apiAdmin(request);
      if (!account.ok) return account.response;
      const refused = refuseWrite(request);
      if (refused) return refused;
      const workspaceId = param(workspaceIdSchema, (await params).id);
      if (!workspaceId) return json({ error: "not-found" }, 404);
      const body = await readJson(request, schema);
      if (!body.ok) return body.response;
      const { db, user } = account;
      const target = { adminId: user.id, workspaceId };
      return await run({ db, admin: user, target, body: body.value, now: Date.now() });
    } catch (error) {
      console.error(`squint admin: storage failed (${describeError(error)})`);
      return json({ error: "storage" }, 500);
    }
  };
}
