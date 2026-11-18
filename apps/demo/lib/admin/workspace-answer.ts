import type { Database } from "../db/database";
import { json } from "../share/http";
import type { AdminActionResult, AdminTarget } from "./workspace-actions";
import { loadAdminWorkspace } from "./workspaces";

/**
 * A workspace action's answer: `{ workspace }`, the workspace as the list
 * shows it now, so the page shows what the server holds; 404 when it's gone.
 */
export async function workspaceAnswer(
  db: Database,
  { workspaceId }: AdminTarget,
  result: AdminActionResult,
): Promise<Response> {
  const workspace = result.ok ? await loadAdminWorkspace(db, workspaceId) : null;
  return workspace ? json({ workspace }) : json({ error: "not-found" }, 404);
}
